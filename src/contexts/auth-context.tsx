'use client';

import * as React from 'react';
import type { User, Store } from '@/lib/types';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

interface AuthContextType {
  currentUser: User | null;
  activeStore: Store | null;
  pujaseraTenants: Store[]; // New: To hold all tenants for a pujasera admin
  pradanaTokenBalance: number;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshPradanaTokenBalance: () => void;
  refreshActiveStore: () => void;
  updateActiveStore: (newStoreData: Partial<Store>) => void;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);
  const [activeStore, setActiveStore] = React.useState<Store | null>(null);
  const [pujaseraTenants, setPujaseraTenants] = React.useState<Store[]>([]);
  const [pradanaTokenBalance, setPradanaTokenBalance] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const { toast } = useToast();
  const router = useRouter();
  
  const refreshActiveStore = React.useCallback(async () => {
    if (!activeStore?.id) return;
    try {
        const storeDocRef = doc(db, 'stores', activeStore.id);
        const storeDoc = await getDoc(storeDocRef);
        if (storeDoc.exists()) {
            const newStoreData = { id: storeDoc.id, ...storeDoc.data() } as Store;
            setActiveStore(newStoreData);
            setPradanaTokenBalance(newStoreData.pradanaTokenBalance || 0);
        }
    } catch (error) {
        console.error("Error refreshing active store:", error);
    }
  }, [activeStore?.id]);


  const refreshPradanaTokenBalance = React.useCallback(async () => {
    if (!activeStore) return;
    try {
      const storeDocRef = doc(db, 'stores', activeStore.id);
      const storeDoc = await getDoc(storeDocRef);
      if (storeDoc.exists()) {
        setPradanaTokenBalance(storeDoc.data()?.pradanaTokenBalance || 0);
      }
    } catch (error) {
      console.error("Error refreshing token balance:", error);
    }
  }, [activeStore]);

  const updateActiveStore = (newStoreData: Partial<Store>) => {
    setActiveStore(prevStore => {
      if (!prevStore) return null;
      const updatedStore = { ...prevStore, ...newStoreData };
      
      if (newStoreData.pradanaTokenBalance !== undefined) {
        setPradanaTokenBalance(newStoreData.pradanaTokenBalance);
      }
      
      return updatedStore;
    });
  };

  const handleLogout = React.useCallback(async () => {
    await signOut(auth);
    setCurrentUser(null);
    setActiveStore(null);
    setPujaseraTenants([]);
    setPradanaTokenBalance(0);
  }, []);

  const handleUserSession = React.useCallback(async (user: import('firebase/auth').User | null) => {
    setIsLoading(true);
    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          throw new Error(`User document not found for UID: ${user.uid}`);
        }
        
        const userData = { id: userDoc.id, ...userDoc.data() } as User;

        if (userData.status === 'inactive') {
          throw new Error('Akun Anda tidak aktif. Silakan hubungi administrator.');
        }

        setCurrentUser(userData);

        let storeIdToLoad: string | undefined;
        let isPujaseraAdmin = false;

        // Determine the store context based on user role
        if (userData.role === 'pujasera_admin') {
            isPujaseraAdmin = true;
            storeIdToLoad = userData.storeId; // The pujasera admin's storeId is the pujasera's own document ID
        } else if (userData.role === 'pujasera_cashier') {
             if (userData.pujaseraGroupSlug) {
                const q = query(collection(db, 'stores'), where('pujaseraGroupSlug', '==', userData.pujaseraGroupSlug), limit(1));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) storeIdToLoad = snapshot.docs[0].id;
             }
        } else if (userData.role === 'admin') {
            const storesQuery = query(collection(db, 'stores'), where('adminUids', 'array-contains', user.uid));
            const storesSnapshot = await getDocs(storesQuery);
            if (!storesSnapshot.empty) storeIdToLoad = storesSnapshot.docs[0].id;
        } else if ((userData.role === 'cashier' || userData.role === 'kitchen') && userData.storeId) {
            storeIdToLoad = userData.storeId;
        }
        
        if (!storeIdToLoad) {
           await handleLogout();
           router.push('/login');
           toast({ variant: 'destructive', title: 'Error Sesi', description: 'Tidak ada toko yang terasosiasi dengan akun Anda.' });
           setIsLoading(false);
           return;
        }
        
        const storeDocRef = doc(db, 'stores', storeIdToLoad);
        const storeDoc = await getDoc(storeDocRef);
        if (!storeDoc.exists()) throw new Error(`Toko dengan ID '${storeIdToLoad}' tidak ditemukan.`);

        const storeData = { id: storeDoc.id, ...storeDoc.data() } as Store;
        setActiveStore(storeData);
        setPradanaTokenBalance(storeData.pradanaTokenBalance || 0);

        // If it's a pujasera admin, load all their tenants
        if (isPujaseraAdmin && storeData.pujaseraGroupSlug) {
            const tenantsQuery = query(collection(db, 'stores'), where('pujaseraGroupSlug', '==', storeData.pujaseraGroupSlug));
            const tenantsSnapshot = await getDocs(tenantsQuery);
            const tenantsData = tenantsSnapshot.docs.map(d => ({id: d.id, ...d.data()} as Store));
            setPujaseraTenants(tenantsData);
        } else {
            setPujaseraTenants([]);
        }
        
      } catch (error) {
        console.error("Error handling user session:", error);
        toast({ variant: 'destructive', title: 'Error Sesi', description: (error as Error).message });
        await handleLogout();
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    } else {
      await handleLogout();
      setIsLoading(false);
    }
  }, [toast, router, handleLogout]);


  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, handleUserSession);
    return () => unsubscribe();
  }, [handleUserSession]);

  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        let errorMessage = "Terjadi kesalahan. Silakan coba lagi.";
        if (error instanceof FirebaseError) {
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                errorMessage = "Email atau password yang Anda masukkan salah.";
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage = "Terlalu banyak percobaan login. Silakan coba lagi nanti.";
            }
        }
        toast({ variant: 'destructive', title: 'Login Gagal', description: errorMessage });
        throw error;
    }
  };

  const logout = async () => {
    await handleLogout();
    router.push('/login');
    toast({
      title: 'Logout Berhasil',
      description: 'Anda telah keluar.',
    });
  };

  const value = { currentUser, activeStore, pujaseraTenants, pradanaTokenBalance, isLoading, login, logout, refreshPradanaTokenBalance, refreshActiveStore, updateActiveStore };

  return (
    <AuthContext.Provider value={value}>
        {children}
        <FirebaseErrorListener />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
