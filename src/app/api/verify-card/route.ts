import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq, inArray, and } from "drizzle-orm";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Verify API Key from request headers
 */
function verifyApiKey(request: Request): boolean {
    const apiKey = process.env.OPENAPI_KEY;
    if (!apiKey) {
        console.error("[Verify Card] OPENAPI_KEY not configured");
        return false;
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return false;

    // Support both "Bearer <key>" and "<key>" formats
    const providedKey = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader;

    return providedKey === apiKey;
}

/**
 * API endpoint to verify if a card key exists in sold orders.
 * 
 * Requires API Key authentication via Authorization header.
 * Set VERIFY_CARD_API_KEY environment variable.
 * 
 * POST /api/verify-card
 * Headers: { "Authorization": "Bearer your-api-key" }
 * Body: { "cardKey": "your-card-key-here" }
 * 
 * Response:
 * - { "valid": true, "orderId": "xxx", "productName": "xxx", "soldAt": "xxx" } if found
 * - { "valid": false } if not found
 */
export async function POST(request: Request) {
    // Verify API Key
    if (!verifyApiKey(request)) {
        return Response.json(
            { error: 'Unauthorized: Invalid or missing API key' },
            { status: 401 }
        );
    }

    try {
        const body = await request.json();
        const { cardKey } = body;

        if (!cardKey || typeof cardKey !== 'string') {
            return Response.json(
                { error: 'Missing or invalid cardKey parameter' },
                { status: 400 }
            );
        }

        const trimmedKey = cardKey.trim();
        if (!trimmedKey) {
            return Response.json(
                { error: 'Card key cannot be empty' },
                { status: 400 }
            );
        }

        // Search for exact card key match in sold orders (paid or delivered status)
        const order = await db.query.orders.findFirst({
            where: and(
                eq(orders.cardKey, trimmedKey),
                inArray(orders.status, ['paid', 'delivered'])
            ),
            columns: {
                orderId: true,
                productName: true,
                paidAt: true,
                deliveredAt: true,
            }
        });

        if (order) {
            return Response.json({
                valid: true,
                orderId: order.orderId,
                productName: order.productName,
                soldAt: order.paidAt || order.deliveredAt,
            });
        }

        // Card key not found in any sold order
        return Response.json({ valid: false });

    } catch (e: any) {
        console.error("[Verify Card] Error:", e);
        return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// Also support GET for simple testing
export async function GET(request: Request) {
    // Verify API Key
    if (!verifyApiKey(request)) {
        return Response.json(
            { error: 'Unauthorized: Invalid or missing API key' },
            { status: 401 }
        );
    }

    try {
        const url = new URL(request.url);
        const cardKey = url.searchParams.get('cardKey');

        if (!cardKey) {
            return Response.json(
                { error: 'Missing cardKey query parameter' },
                { status: 400 }
            );
        }

        // Reuse POST logic by creating a mock request with auth header
        const mockRequest = new Request(request.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': request.headers.get('Authorization') || '',
            },
            body: JSON.stringify({ cardKey }),
        });

        return POST(mockRequest);

    } catch (e: any) {
        console.error("[Verify Card] Error:", e);
        return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
