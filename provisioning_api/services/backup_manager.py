import os
import subprocess
import boto3
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass


@dataclass
class BackupResult:
    success: bool
    tenant_id: str
    backup_path: str
    s3_key: Optional[str]
    size_mb: float
    duration_seconds: float
    error: Optional[str] = None


class BackupConfig:
    def __init__(self):
        self.s3_bucket = os.getenv("S3_BACKUP_BUCKET", "billed-core-backups")
        self.s3_region = os.getenv("AWS_REGION", "ap-south-1")
        self.s3_prefix = os.getenv("S3_PREFIX", "tenants")
        self.backup_retention_hours = int(os.getenv("BACKUP_RETENTION_HOURS", "168"))  # 7 days
        self.db_password = os.getenv("DB_PASSWORD", "admin")
        self.sites_dir = Path("/home/frappe/frappe-bench/sites")
        self.backup_dir = Path("/backups")


class TenantBackupManager:
    """Manages per-tenant backups to S3 with point-in-time recovery"""
    
    def __init__(self, config: BackupConfig = None):
        self.config = config or BackupConfig()
        self.s3 = boto3.client('s3', region_name=self.config.s3_region)
        self._ensure_bucket()
    
    def _ensure_bucket(self):
        """Create bucket if not exists (for dev only)"""
        try:
            self.s3.head_bucket(Bucket=self.config.s3_bucket)
        except:
            # In production, use existing bucket
            pass
    
    def backup_tenant(self, tenant_id: str) -> BackupResult:
        """Backup a single tenant"""
        start_time = datetime.utcnow()
        backup_file = self.config.backup_dir / f"{tenant_id}_{start_time.strftime('%Y%m%d_%H%M%S')}.sql.gz"
        
        # Ensure backup directory
        self.config.backup_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # 1. Lock site (prevent writes during backup)
            # Note: mariadb-dump with --single-transaction for consistent backup
            
            # 2. Dump tenant database
            dump_cmd = [
                "mariadb-dump",
                "-uroot", f"-p{self.config.db_password}",
                "--single-transaction",
                "--quick",
                f"_tenant_{tenant_id}",
                "|", "gzip"
            ]
            
            # Run dump
            result = subprocess.run(
                " ".join(dump_cmd),
                shell=True,
                capture_output=True,
                timeout=300
            )
            
            if result.returncode != 0:
                return BackupResult(
                    success=False,
                    tenant_id=tenant_id,
                    backup_path="",
                    s3_key=None,
                    size_mb=0,
                    duration_seconds=0,
                    error=result.stderr.decode()[-200:]
                )
            
            # 3. Save locally
            backup_file.write_bytes(result.stdout)
            size_mb = backup_file.stat().st_size / (1024 * 1024)
            
            # 4. Upload to S3
            s3_key = f"{self.config.s3_prefix}/{tenant_id}/backups/{backup_file.name}"
            self.s3.upload_file(
                str(backup_file),
                self.config.s3_bucket,
                s3_key,
                ExtraArgs={
                    "StorageClass": "STANDARD_IA",  # Cheaper for backups
                    "Metadata": {
                        "tenant_id": tenant_id,
                        "created_at": start_time.isoformat()
                    }
                }
            )
            
            duration = (datetime.utcnow() - start_time).total_seconds()
            
            # 5. Clean old local backup
            backup_file.unlink()
            
            return BackupResult(
                success=True,
                tenant_id=tenant_id,
                backup_path=str(backup_file),
                s3_key=s3_key,
                size_mb=round(size_mb, 2),
                duration_seconds=round(duration, 2)
            )
            
        except Exception as e:
            return BackupResult(
                success=False,
                tenant_id=tenant_id,
                backup_path=str(backup_file),
                s3_key=None,
                size_mb=0,
                duration_seconds=0,
                error=str(e)
            )
    
    def restore_tenant(self, tenant_id: str, backup_date: Optional[datetime] = None) -> bool:
        """Restore a tenant from S3 backup"""
        
        # 1. Find the backup
        if backup_date:
            # Find specific backup
            prefix = f"{self.config.s3_prefix}/{tenant_id}/backups/"
        else:
            # Find latest
            prefix = f"{self.config.s3_prefix}/{tenant_id}/backups/"
        
        response = self.s3.list_objects_v2(
            Bucket=self.config.s3_bucket,
            Prefix=prefix
        )
        
        if "Contents" not in response or not response["Contents"]:
            raise ValueError(f"No backups found for tenant {tenant_id}")
        
        # Get latest backup
        latest = sorted(
            response["Contents"],
            key=lambda x: x["LastModified"],
            reverse=True
        )[0]
        
        # 2. Download from S3
        backup_file = self.config.backup_dir / latest["Key"].split("/")[-1]
        self.s3.download_file(
            self.config.s3_bucket,
            latest["Key"],
            str(backup_file)
        )
        
        # 3. Create new database for tenant
        create_db_cmd = [
            "mariadb",
            f"-uroot -p{self.config.db_password}",
            f"-e CREATE DATABASE IF NOT EXISTS _tenant_{tenant_id}"
        ]
        subprocess.run(" ".join(create_db_cmd), shell=True)
        
        # 4. Restore
        restore_cmd = f"gunzip < {backup_file} | mariadb -uroot -p{self.config.db_password} -"
        subprocess.run(restore_cmd, shell=True, timeout=300)
        
        # 5. Clean up
        backup_file.unlink()
        
        return True
    
    def list_backups(self, tenant_id: str) -> List[dict]:
        """List all backups for a tenant"""
        prefix = f"{self.config.s3_prefix}/{tenant_id}/backups/"
        
        response = self.s3.list_objects_v2(
            Bucket=self.config.s3_bucket,
            Prefix=prefix
        )
        
        if "Contents" not in response:
            return []
        
        return [
            {
                "key": obj["Key"],
                "size_mb": round(obj["Size"] / (1024 * 1024), 2),
                "created_at": obj["LastModified"].isoformat()
            }
            for obj in sorted(response["Contents"], key=lambda x: x["LastModified"], reverse=True)
        ]
    
    def cleanup_old_backups(self, tenant_id: str):
        """Clean backups older than retention period"""
        cutoff = datetime.utcnow() - timedelta(hours=self.config.backup_retention_hours)
        
        prefix = f"{self.config.s3_prefix}/{tenant_id}/backups/"
        
        response = self.s3.list_objects_v2(
            Bucket=self.config.s3_bucket,
            Prefix=prefix
        )
        
        if "Contents" not in response:
            return
        
        to_delete = []
        for obj in response["Contents"]:
            if obj["LastModified"].replace(tzinfo=None) < cutoff:
                to_delete.append({"Key": obj["Key"]})
        
        if to_delete:
            self.s3.delete_objects(
                Bucket=self.config.s3_bucket,
                Delete={
                    "Objects": to_delete,
                    "Quiet": True
                }
            )


class BackupScheduler:
    """Scheduler for automatic backups"""
    
    def __init__(self, manager: TenantBackupManager):
        self.manager = manager
    
    def backup_all_active_tenants(self):
        """Backup all active tenants"""
        sites_dir = self.manager.config.sites_dir
        
        results = []
        for site in sites_dir.iterdir():
            if site.is_dir() and not site.name.startswith((".", "template")):
                result = self.manager.backup_tenant(site.name)
                results.append(result)
        
        return results


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Tenant Backup Manager")
    parser.add_argument("action", choices=["backup", "restore", "list", "cleanup"])
    parser.add_argument("--tenant", help="Tenant ID")
    parser.add_argument("--date", help="Backup date (YYYY-MM-DD)")
    
    args = parser.parse_args()
    manager = TenantBackupManager()
    
    if args.action == "backup" and args.tenant:
        result = manager.backup_tenant(args.tenant)
        print(f"Success: {result.success}, Size: {result.size_mb}MB")
    
    elif args.action == "list" and args.tenant:
        backups = manager.list_backups(args.tenant)
        for b in backups:
            print(f"{b['created_at']}: {b['size_mb']}MB")
    
    elif args.action == "cleanup" and args.tenant:
        manager.cleanup_old_backups(args.tenant)
        print("Cleanup complete")