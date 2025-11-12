export type AIFeatureInfo = {
  title: string;
  description: string;
};

export const aiFeatures: Record<string, AIFeatureInfo> = {
  'admin-overview': {
    title: 'Rekomendasi Bisnis AI',
    description:
      'Chika AI dapat menganalisis data penjualan, produk terlaris, dan produk kurang laris untuk memberikan rekomendasi strategis mingguan dan bulanan guna meningkatkan performa toko Anda.',
  },
  'pos': {
    title: 'Rekomendasi Penukaran Poin',
    description:
      'Saat pelanggan bertransaksi, Chika AI dapat memberikan rekomendasi cara terbaik untuk menukarkan poin loyalitas mereka, membantu meningkatkan keterlibatan pelanggan dan penggunaan poin.',
  },
  'promotions': {
    title: 'Rekomendasi Promo Baru',
    description:
      'Chika AI dapat menganalisis data penjualan dan promo yang ada untuk memberikan ide-ide promosi loyalitas baru yang kreatif dan relevan dengan tren penjualan toko Anda.',
  },
  'challenges': {
    title: 'Generator Tantangan Karyawan',
    description:
      'Buat program insentif yang memotivasi untuk karyawan Anda. Chika AI dapat membuat beberapa tingkatan tantangan penjualan berdasarkan anggaran dan periode waktu yang Anda tentukan.',
  },
  'receipt-settings': {
    title: 'Generator Teks Promo Struk',
    description:
      'Tingkatkan interaksi pelanggan setelah pembelian. Chika AI dapat membuat satu baris teks promo yang menarik dan singkat untuk dicetak di bagian bawah struk belanja, berdasarkan promo yang sedang aktif.',
  },
   'overview': {
    title: 'Pesan Ulang Tahun Personal',
    description:
      'Kirim ucapan selamat ulang tahun yang lebih personal kepada pelanggan. Chika AI dapat membuat pesan unik yang menyertakan zodiak pelanggan dan penawaran diskon spesial.',
  },
  'transactions': {
    title: 'Follow Up Pesanan Cerdas',
    description:
      'Beritahu pelanggan bahwa pesanan mereka siap dengan cara yang unik. Chika AI dapat membuat pesan notifikasi WhatsApp yang berisi pantun atau fakta menarik tentang item yang dipesan.',
  },
};
