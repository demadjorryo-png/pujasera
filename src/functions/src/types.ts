
// This file is intended for use within the Cloud Functions environment.
// It defines types that are shared across different function modules.

export type CartItem = {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    notes?: string;
    storeId?: string; // Pujasera context: which store this item belongs to
}

export type TableOrderCustomer = { 
    id: string; 
    name: string; 
    phone: string;
};

export type TableOrder = {
  items: CartItem[];
  totalAmount: number;
  orderTime: string; // ISO 8601
  customer?: TableOrderCustomer;
  paymentMethod?: 'kasir' | 'qris';
  transactionId?: string;
};

export type Table = {
  id: string;
  name: string;
  status: 'Tersedia' | 'Terisi' | 'Dipesan' | 'Menunggu Dibersihkan';
  capacity: number;
  isVirtual?: boolean;
  currentOrder?: TableOrder | null;
};

export type Transaction = {
  id: string;
  receiptNumber: number;
  storeId: string;
  customerId: string;
  customerName: string;
  staffId: string;
  createdAt: string; // ISO 8601
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  serviceFeeAmount: number;
  totalAmount: number;
  paymentMethod: 'Cash' | 'Card' | 'QRIS' | 'Belum Dibayar' | 'Lunas (Pusat)';
  pointsEarned: number;
  pointsRedeemed: number;
  items: CartItem[];
  tableId?: string;
  status: 'Diproses' | 'Siap Diambil' | 'Selesai' | 'Selesai Dibayar' | 'Belum Dibayar' | 'Dibatalkan';
  generatedFollowUpText?: string;
  pujaseraGroupSlug?: string;
  itemsStatus?: { [key: string]: 'Diproses' | 'Siap Diambil' };
};
