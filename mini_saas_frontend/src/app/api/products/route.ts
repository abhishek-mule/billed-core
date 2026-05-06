import { NextRequest, NextResponse } from "next/server";

// Product type definition
interface Product {
  id: string;
  tenantId: string;
  name: string;
  barcode?: string;
  hsn?: string;
  gstRate: number;
  stock: number;
  lowStockAt: number;
  salePrice: number;
  purchasePrice: number;
  unit?: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory store for demo (replace with database in production)
const productsDb: Product[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      tenantId,
      name,
      barcode,
      hsn,
      gstRate,
      stock,
      lowStockAt,
      salePrice,
      purchasePrice,
      unit,
    } = body;

    // Validation
    if (!tenantId) {
      return NextResponse.json(
        { error: "Tenant ID is required" },
        { status: 400 }
      );
    }

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "Product name is required" },
        { status: 400 }
      );
    }

    // Create product
    const now = new Date().toISOString();
    const product: Product = {
      id: `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      name: name.trim(),
      barcode: barcode || undefined,
      hsn: hsn || undefined,
      gstRate: gstRate ?? 0,
      stock: stock ?? 0,
      lowStockAt: lowStockAt ?? 10,
      salePrice: salePrice ?? 0,
      purchasePrice: purchasePrice ?? 0,
      unit: unit || "pcs",
      createdAt: now,
      updatedAt: now,
    };

    // Save to database (in-memory for demo)
    productsDb.push(product);

    console.log("Product created:", product);

    return NextResponse.json({
      success: true,
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json(
        { error: "Tenant ID is required" },
        { status: 400 }
      );
    }

    // Filter products by tenant
    const products = productsDb.filter((p) => p.tenantId === tenantId);

    return NextResponse.json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}