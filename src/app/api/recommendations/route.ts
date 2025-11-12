import { NextRequest, NextResponse } from 'next/server';
import { adminRecommendationFlow } from '@/ai/flows/admin-recommendation';
import type { AdminRecommendationInput } from '@/ai/flows/admin-recommendation';


export async function POST(req: NextRequest) {
  try {
    const body: AdminRecommendationInput = await req.json();
    
    // It's good practice to validate the input from the client
    const { businessDescription, totalRevenueLastWeek, totalRevenueLastMonth, topSellingProducts, worstSellingProducts } = body;
    if (typeof businessDescription !== 'string' || typeof totalRevenueLastWeek !== 'number' || typeof totalRevenueLastMonth !== 'number' || !Array.isArray(topSellingProducts) || !Array.isArray(worstSellingProducts)) {
        return NextResponse.json({ error: 'Invalid input parameters' }, { status: 400 });
    }

    const result = await adminRecommendationFlow({
        businessDescription,
        totalRevenueLastWeek,
        totalRevenueLastMonth,
        topSellingProducts,
        worstSellingProducts,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in recommendations API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
