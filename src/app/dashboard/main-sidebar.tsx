
'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
} from '@/components/ui/sidebar';
import { Logo } from '@/components/dashboard/logo';
import {
  LayoutGrid,
  BookOpenCheck,
  Contact2,
  LogOut,
  Settings,
  History,
  Users,
  Trophy,
  Gift,
  CircleDollarSign,
  Receipt,
  UserCircle,
  BarChart4,
  Armchair,
  Store,
  Wallet,
  TrendingUp,
  Map,
  Newspaper,
  ChefHat,
  ShieldCheck,
  Building,
} from 'lucide-react';
import * as React from 'react';
import { Separator } from '@/components/ui/separator';
import { TopUpDialog } from '@/components/dashboard/top-up-dialog';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/auth-context';
import { ThemeSwitcher } from '@/components/dashboard/theme-switcher';

type MainSidebarProps = {
  pradanaTokenBalance: number;
}

export function MainSidebar({ pradanaTokenBalance }: MainSidebarProps) {
  const { currentUser, activeStore, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Define default views for each role
  const roleDefaultViews: Record<string, string> = {
    'pujasera_admin': 'pujasera-overview',
    'pujasera_cashier': 'pujasera-pos',
    'admin': 'overview',
    'cashier': 'pos',
    'kitchen': 'kitchen',
    'superadmin': 'platform-control',
  };
  const defaultView = currentUser?.role ? roleDefaultViews[currentUser.role] : 'pos';
  const currentView = searchParams.get('view') || defaultView;
  
  const [isTopUpOpen, setIsTopUpOpen] = React.useState(false);

  const navigate = (view: string) => {
    const newParams = new URLSearchParams(searchParams.toString());
    if (view !== 'pujasera-pos' && view !== 'pos') {
      newParams.delete('tableId');
      newParams.delete('tableName');
    }
    newParams.set('view', view);
    router.push(`${pathname}?${newParams.toString()}`);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const menuGroups = [
    {
        group: 'Platform',
        icon: <ShieldCheck />,
        roles: ['superadmin'],
        items: [
             { view: 'platform-control', label: 'Kontrol Platform', icon: <ShieldCheck />, roles: ['superadmin'] },
        ]
    },
    {
        group: 'Pujasera',
        icon: <Building />,
        roles: ['pujasera_admin', 'pujasera_cashier'],
        items: [
            { view: 'pujasera-overview', label: 'Overview Pujasera', icon: <LayoutGrid />, roles: ['pujasera_admin'], tourId: 'sidebar-overview' },
            { view: 'pujasera-pos', label: 'Kasir Pujasera', icon: <Armchair />, roles: ['pujasera_cashier', 'pujasera_admin'], tourId: 'sidebar-pos' },
            { view: 'transactions', label: 'Transaksi', icon: <History />, roles: ['pujasera_admin', 'pujasera_cashier'], tourId: 'sidebar-transactions' },
            { view: 'kitchen', label: 'Dapur Terpusat', icon: <ChefHat />, roles: ['pujasera_admin', 'pujasera_cashier'], tourId: 'sidebar-kitchen' },
            { view: 'tenants', label: 'Manajemen Tenant', icon: <Store />, roles: ['pujasera_admin'], tourId: 'sidebar-tenants' },
            { view: 'employees', label: 'Manajemen Karyawan', icon: <Users />, roles: ['pujasera_admin'], tourId: 'sidebar-employees' },
            { view: 'customers', label: 'Pelanggan', icon: <Contact2 />, roles: ['pujasera_admin', 'pujasera_cashier'], tourId: 'sidebar-customers' },
            { view: 'promotions', label: 'Promo Pujasera', icon: <Gift />, roles: ['pujasera_admin'], tourId: 'sidebar-promotions' },
            { view: 'challenges', label: 'Tantangan Tenant', icon: <Trophy />, roles: ['pujasera_admin'], tourId: 'sidebar-challenges' },
            { view: 'catalog', label: 'Katalog Publik', icon: <Newspaper />, roles: ['pujasera_admin'], tourId: 'sidebar-catalog' },
            { view: 'receipt-settings', label: 'Pengaturan Struk', icon: <Receipt />, roles: ['pujasera_admin'], tourId: 'sidebar-receipt-settings' },
        ]
    },
    {
        group: 'Operasional Tenant',
        icon: <Store />,
        roles: ['admin', 'cashier', 'kitchen'],
        items: [
            { view: 'overview', label: 'Overview', icon: <LayoutGrid />, roles: ['admin', 'cashier'], tourId: 'sidebar-overview' },
            // Menonaktifkan Kasir POS untuk tenant
            // { view: 'pos', label: 'Kasir POS', icon: <Armchair />, roles: ['admin', 'cashier'], tourId: 'sidebar-pos', check: () => activeStore?.posMode === 'sendiri' },
            { view: 'kitchen', label: 'Dapur', icon: <ChefHat />, roles: ['admin', 'kitchen'], tourId: 'sidebar-kitchen' },
            { view: 'transactions', label: 'Transaksi', icon: <History />, roles: ['admin', 'cashier'], tourId: 'sidebar-transactions' },
        ]
    },
    {
        group: 'Manajemen Tenant',
        icon: <Wallet />,
        roles: ['admin', 'cashier'],
        items: [
            { view: 'products', label: 'Produk (Menu)', icon: <BookOpenCheck />, roles: ['admin', 'cashier'], tourId: 'sidebar-products' },
            { view: 'employees', label: 'Karyawan', icon: <Users />, roles: ['admin'], tourId: 'sidebar-employees' },
        ]
    },
    {
        group: 'Analisis & Pertumbuhan',
        icon: <TrendingUp />,
        roles: ['admin'],
        items: [
            { view: 'customer-analytics', label: 'Analisis Pelanggan', icon: <BarChart4 />, roles: ['admin'], tourId: 'sidebar-customer-analytics' },
            { view: 'ai-business-plan', label: 'AI Business Plan', icon: <Map />, roles: ['admin'], tourId: 'sidebar-ai-business-plan' },
        ]
    },
     {
        group: 'Pengaturan Toko',
        icon: <Settings />,
        roles: ['admin'],
        items: [
            { view: 'receipt-settings', label: 'Pengaturan Struk', icon: <Receipt />, roles: ['admin'], tourId: 'sidebar-receipt-settings' },
        ]
    },
  ];

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin' || currentUser?.role === 'pujasera_admin';

  const tokenDisplay = (
      <div className="flex items-center justify-center gap-2 text-sidebar-foreground">
          <CircleDollarSign className="h-4 w-4" />
          <span className="font-mono text-sm font-semibold">{pradanaTokenBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
      </div>
  )

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="items-center">
        <Logo storeName={activeStore?.name} />
        <div className="mt-2 w-full text-center group-data-[collapsible=icon]:hidden">
            <Separator className="mb-2 bg-sidebar-border" />
              <Dialog open={isTopUpOpen} onOpenChange={setIsTopUpOpen}>
                {isAdmin ? (
                    <DialogTrigger asChild>
                        <div data-tour="top-up-button" className="cursor-pointer rounded-md p-1 hover:bg-sidebar-accent">
                            {tokenDisplay}
                        </div>
                    </DialogTrigger>
                ) : (
                    <div className="p-1">
                        {tokenDisplay}
                    </div>
                )}
                <TopUpDialog 
                    setDialogOpen={setIsTopUpOpen} 
                />
              </Dialog>
              <p className="text-xs text-sidebar-foreground/70">Pradana Token</p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {menuGroups.map((group) => {
            if (!currentUser || !group.roles.includes(currentUser.role)) return null;
            
            const visibleItems = group.items.filter(item => {
                const hasRole = item.roles.includes(currentUser.role);
                const checkPasses = item.check ? item.check() : true;
                return hasRole && checkPasses;
            });

            if (visibleItems.length === 0) return null;

            return (
              <SidebarGroup key={group.group}>
                <SidebarGroupLabel className="group-data-[collapsible=icon]:justify-center">
                  {group.icon}
                  <span>{group.group}</span>
                </SidebarGroupLabel>
                {visibleItems.map((item) => (
                  <SidebarMenuItem key={item.view} data-tour={item.tourId}>
                    <SidebarMenuButton
                      onClick={() => navigate(item.view)}
                      isActive={currentView === item.view}
                      tooltip={item.label}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarGroup>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
         <SidebarMenu>
            {currentUser && (
               <div className="mb-2 w-full p-2 group-data-[collapsible=icon]:hidden">
                  <Separator className="mb-2 bg-sidebar-border" />
                  <div className="flex items-center gap-2 rounded-md p-2">
                     <UserCircle className="h-8 w-8 shrink-0" />
                     <div className="overflow-hidden">
                        <p className="truncate font-semibold">{currentUser.name}</p>
                        <p className="truncate text-xs text-sidebar-foreground/70 capitalize">{currentUser.role.replace(/_/g, ' ')}</p>
                     </div>
                  </div>
               </div>
            )}
            <ThemeSwitcher />
          <SidebarMenuItem data-tour="sidebar-settings">
            <SidebarMenuButton tooltip="Pengaturan" onClick={() => navigate('settings')} isActive={currentView === 'settings'}>
              <Settings />
              <span>Pengaturan</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Keluar" onClick={handleLogout}>
              <LogOut />
              <span>Keluar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
