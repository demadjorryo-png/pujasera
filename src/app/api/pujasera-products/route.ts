import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';
import type { Product } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ error: 'Missing pujasera group slug' }, { status: 400 });
  }

  const { auth, db } = getFirebaseAdmin();
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const idToken = authorization.split('Bearer ')[1];

  try {
    // Authenticate the user
    await auth.verifyIdToken(idToken);

    // Find all stores (tenants) belonging to the pujasera group
    const tenantsSnapshot = await db.collection('stores').where('pujaseraGroupSlug', '==', slug).get();
    
    // Filter out the pujasera's own document and tenants that have POS disabled
    const activeTenants = tenantsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(tenant => tenant.posMode === 'terpusat');

    if (activeTenants.length === 0) {
        return NextResponse.json([]);
    }

    const productPromises = activeTenants.map(async (tenant) => {
        const productsSnapshot = await db.collection('stores').doc(tenant.id).collection('products').where('stock', '>', 0).get();
        return productsSnapshot.docs.map(doc => ({
            ...doc.data() as Product,
            id: doc.id,
            storeId: tenant.id,
            storeName: tenant.name,
        }));
    });

    const allProducts = (await Promise.all(productPromises)).flat();
    
    return NextResponse.json(allProducts);
  } catch (error) {
    console.error('Error fetching pujasera products:', error);
    if ((error as any).code === 'auth/id-token-expired') {
        return NextResponse.json({ error: 'Authentication token expired' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
