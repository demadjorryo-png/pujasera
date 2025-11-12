
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';

export async function GET(req: NextRequest) {
  const { db } = getFirebaseAdmin();
  const slug = req.nextUrl.searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ error: 'Parameter slug diperlukan.' }, { status: 400 });
  }

  try {
    // 1. Find the main Pujasera document by its unique catalogSlug
    const pujaseraQuery = db.collection('stores').where('catalogSlug', '==', slug).limit(1);
    const pujaseraSnapshot = await pujaseraQuery.get();

    if (pujaseraSnapshot.empty) {
      return NextResponse.json({ error: 'Katalog tidak ditemukan.' }, { status: 404 });
    }
    
    const pujaseraDoc = pujaseraSnapshot.docs[0];
    const pujaseraData = pujaseraDoc.data();

    // 2. Check if the subscription is active
    const now = new Date();
    const expiryDate = pujaseraData?.catalogSubscriptionExpiry ? new Date(pujaseraData.catalogSubscriptionExpiry) : null;
    if (!expiryDate || expiryDate < now) {
        return NextResponse.json({ error: 'Katalog saat ini tidak tersedia atau langganan telah berakhir.' }, { status: 403 });
    }

    const pujaseraGroupSlug = pujaseraData.pujaseraGroupSlug;
    if (!pujaseraGroupSlug) {
      return NextResponse.json({ error: 'Konfigurasi grup pujasera tidak ditemukan.' }, { status: 500 });
    }

    // 3. Find all active tenants in the pujasera group, excluding the pujasera document itself
    const tenantsQuery = db.collection('stores')
      .where('pujaseraGroupSlug', '==', pujaseraGroupSlug)
      .where('__name__', '!=', pujaseraDoc.id);
      
    const tenantsSnapshot = await tenantsQuery.get();

    // 4. Fetch products for each active tenant
    const tenantProductPromises = tenantsSnapshot.docs.map(async (tenantDoc) => {
        const tenantData = tenantDoc.data();
        // Skip tenants that are explicitly disabled
        if (tenantData.isPosEnabled === false) {
            return null;
        }

        const productsSnapshot = await db.collection('stores').doc(tenantDoc.id).collection('products').orderBy('name').get();
        const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return {
            id: tenantDoc.id,
            name: tenantData.name,
            products: products,
        };
    });

    const tenantsWithProducts = (await Promise.all(tenantProductPromises)).filter(Boolean);
    
    // 5. Fetch active promotions for the pujasera
    const promotionsSnapshot = await db.collection('stores').doc(pujaseraDoc.id).collection('redemptionOptions')
        .where('isActive', '==', true)
        .get();
        
    const promotions = promotionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
    }));

    const catalogData = {
      pujasera: {
        id: pujaseraDoc.id,
        name: pujaseraData?.name,
        description: pujaseraData?.description,
        logoUrl: pujaseraData?.logoUrl,
        qrisImageUrl: pujaseraData?.qrisImageUrl,
        theme: pujaseraData?.theme,
        socialLinks: pujaseraData?.socialLinks,
        location: pujaseraData?.location,
        financialSettings: pujaseraData?.financialSettings,
      },
      tenants: tenantsWithProducts,
      promotions: promotions,
    };

    return NextResponse.json(catalogData);

  } catch (error) {
    console.error('Error fetching catalog data:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan internal saat memuat katalog.' }, { status: 500 });
  }
}
