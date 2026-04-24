# BillZo Backup & Recovery Guide

## Architecture

- **Postgres**: Neon (managed PostgreSQL)
- **Redis**: Upstash (managed Redis)

---

## Neon Postgres Backup

### Point-in-Time Recovery (PITR)

1. **Enable PITR in Neon Console**
   - Go to: Neon Dashboard > Project > Settings > Backups
   - Enable Point-in-Time Restore
   - Choose retention: 7 days (minimum for billing)

2. **Recovery Testing**
   ```bash
   # List restore points
   neonctl branches list
   
   # Create fresh branch from point in time
   neonctl branches create --project-id <id> --name restore-test --restore-time "2026-04-24T10:00:00Z"
   ```

3. **Production Restore Procedure**
   ```
   1. Create new branch from restore point
   2. Verify data integrity
   3. Update connection string in env
   4. Deploy new environment
   5. Cutover
   ```

### Manual Backup (pg_dump)

```bash
# Daily backup script
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Compressed backup
pg_dump $DATABASE_URL | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Backup Schedule

| Type | Frequency | Retention |
|------|-----------|-----------|
| Full pg_dump | Daily | 30 days |
| PITR | Continuous | 7 days |
| Archive | Monthly | 12 months |

---

## Upstash Redis Backup

### Export Feature

1. **Console Backup**
   - Go to: Upstash Console > Database > Backups
   - Enable automatic backups
   - Set frequency: daily

2. **Manual Export**
   ```bash
   # Using Upstash CLI
   upstash export --url $UPSTASH_REDIS_REST_URL --token $UPSTASH_REDIS_REST_TOKEN
   ```

3. **Import for Recovery**
   ```bash
   upstash import backup.rdb --url $UPSTASH_REDIS_REST_URL --token $UPSTASH_REDIS_REST_TOKEN
   ```

### Data Categories in Redis

| Key Pattern | Data Type | Backup Priority |
|------------|-----------|----------------|
| session:* | Session data | High |
| tenant_creds:* | Credentials cache | High |
| idempotency:* | Idempotency keys | Medium |
| metrics:* | Metrics | Low |
| circuit:* | Circuit state | Low |

---

## Recovery Procedures

### Scenario 1: Accidental Data Deletion

```
1. Identify affected table and time window
2. Create Neon restore branch
3. Export affected data
4. Import to production
5. Verify integrity
```

### Scenario 2: Redis Data Loss

```
1. Check Upstash backup history
2. Create new Redis database from backup
3. Update UPSTASH_REDIS_REST_URL
4. Clear credential cache (force rebuild)
5. Verify sessions work
```

### Scenario 3: Full Region Outage

```
1. Deploy to alternate region
2. Point to backup database
3. Update DNS
4. Monitor health endpoint
```

---

## Monitoring Alerts

Add to health check in `/api/health`:

```typescript
// Check backup recency
const lastBackup = await redis.get('last_backup')
const hoursSince = (Date.now() - parseInt(lastBackup)) / 3600000

if (hoursSince > 25) {
  alert('No backup in 25 hours')
}
```

---

## Backup Verification Checklist

Before launch, verify:

- [ ] Neon PITR enabled
- [ ] Upstash backups enabled  
- [ ] Recovery docs reviewed
- [ ] Test restore performed (document)
- [ ] Connection strings documented
- [ ] Emergency contacts listed

---

## Recovery Time Objectives

| Scenario | RTO |
|----------|-----|
| Single table recovery | 1 hour |
| Full database recovery | 4 hours |
| Region failover | 1 hour |

## Backup Cost Estimate

| Service | Daily Backup Storage | Monthly Cost |
|--------|----------------------|--------------|
| Neon (PITR) | ~50MB | $15 |
| Upstash | ~10MB | $5 |
| **Total** | | **$20/month** |