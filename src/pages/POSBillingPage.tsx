import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePOS } from '@/contexts/POSContext';
import { useLocale } from '@/contexts/LocaleContext';
import { formatCurrency as formatCurrencyLib, MenuItem, MenuItemVariation, CartItem } from '@/lib/store';
import { directPrint } from '@/lib/printUtils';
import { generateProfessionalBill, generateKOTContent } from '@/lib/billTemplate';
import { useIsMobile } from '@/hooks/use-mobile';
import MobilePOSPage from './MobilePOSPage';
import { VariationSelectorSheet } from '@/components/pos/VariationSelectorSheet';
import { BarcodeButton } from '@/components/pos/BarcodeButton';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { LinkBarcodeDialog } from '@/components/pos/LinkBarcodeDialog';
import { CustomItemDialog } from '@/components/pos/CustomItemDialog';
import { AddonSelectorSheet } from '@/components/pos/AddonSelectorSheet';
import { getAddons, type Addon } from '@/lib/addons';
import { PromptPriceWeightDialog } from '@/components/pos/PromptPriceWeightDialog';
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  Pause, 
  Play, 
  CreditCard, 
  Banknote, 
  Smartphone, 
  Scissors, 
  Printer,
  FileText,
  ChevronUp,
  ChevronDown,
  Percent,
  Receipt,
  MapPin,
  Layers,
  MoreHorizontal,
  Wallet,
  Clock,
  SplitSquareHorizontal,
  Check,
  ScanBarcode,
  User,
  Users,
  PackagePlus,
  QrCode,
  ShoppingBag,
  CalendarClock,
  X,

  Landmark
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { SplitBillDialog } from '@/components/pos/SplitBillDialog';
import { DiscountDialog } from '@/components/pos/DiscountDialog';
import { PartPaymentDialog } from '@/components/pos/PartPaymentDialog';
import { AccessPaymentDialog, AccessPaySubMethod } from '@/components/pos/AccessPaymentDialog';
import { AutoPaymentDialog } from '@/components/payment-hub/AutoPaymentDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import { CustomerDetails } from '@/components/pos/CustomerDetails';
import { autoShareBillAfterPrint } from '@/lib/billShareUtils';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { QRMenuGenerator } from '@/components/pos/QRMenuGenerator';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { QROrdersPanel } from '@/components/pos/QROrdersPanel';
import { useSubscription } from '@/hooks/useSubscription';
import { useSalesResetWarning } from '@/hooks/useSalesResetWarning';
import { SalesResetWarningDialog } from '@/components/pos/SalesResetWarningDialog';
import { useUICustomization, ButtonConfig, DEFAULT_CONFIG } from '@/hooks/useUICustomization';
import { useEditMode } from '@/hooks/useEditMode';
import { EditModeToolbar } from '@/components/pos/EditModeToolbar';
import { DraggableButtonGrid } from '@/components/pos/DraggableButtonGrid';
import { useNavigate } from 'react-router-dom';
import { Settings, Pencil, Eye, EyeOff, GripVertical } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import { useFeatureToggles } from '@/hooks/useFeatureToggles';
import { saveQuotation, generateQuotationNo, computeItemTotal, computeTotals, type QuotationItem } from '@/lib/quotations';
import { getActiveStore } from '@/lib/store';
import { FileSignature } from 'lucide-react';
import {
  Select as LayoutSelect,
  SelectContent as LayoutSelectContent,
  SelectItem as LayoutSelectItem,
  SelectTrigger as LayoutSelectTrigger,
  SelectValue as LayoutSelectValue,
} from '@/components/ui/select';

export const POSBillingPage: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { config: uiConfig, isButtonVisible, toggleButton, reorderButtons, getGroupButtons, updateLayout, updateConfig, resetToDefault } = useUICustomization();
  const editMode = useEditMode();
  const { t, formatCurrency } = useLocale();
  const {
    menuItems,
    categories,
    activeCategory,
    setActiveCategory,
    cart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    cartSubtotal,
    cartTax,
    cartTotal,
    discount,
    setDiscount,
    taxPercent,
    setTaxPercent,
    customTax,
    setCustomTax,
    currentOrderType,
    setCurrentOrderType,
    selectedTable,
    setSelectedTable,
    tables,
    orders,
    placeOrder,
    directBillPrint,
    holdBill,
    heldBills,
    recallBill,
    mergeBills,
    updateTableStatus,

  } = usePOS();

  const [searchQuery, setSearchQuery] = useState(() => {
    return localStorage.getItem('pos_billing_search_query') || '';
  });
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showHeldBills, setShowHeldBills] = useState(false);
  const [showQROrders, setShowQROrders] = useState(false);
  const [selectedHeldBillIds, setSelectedHeldBillIds] = useState<string[]>([]);

  const [selectedPayment, setSelectedPayment] = useState<'cash' | 'card' | 'upi' | 'due' | 'part' | 'wallet' | 'credit' | 'access' | null>(() => {
    return (localStorage.getItem('pos_billing_selected_payment') as any) || null;
  });
  const [activeSection, setActiveSection] = useState<'products' | 'cart' | 'payments' | 'actions'>('products');
  const [cartHighlightIndex, setCartHighlightIndex] = useState(0);
  const [paymentHighlightIndex, setPaymentHighlightIndex] = useState(0);
  const [actionHighlightIndex, setActionHighlightIndex] = useState(0);
  const [sheetPaymentHighlightIndex, setSheetPaymentHighlightIndex] = useState(0);
  const [showBillingSummary, setShowBillingSummary] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [showMorePayments, setShowMorePayments] = useState(false);
  const [showPartPaymentDialog, setShowPartPaymentDialog] = useState(false);
  const [showAutoPaymentDialog, setShowAutoPaymentDialog] = useState(false);
  const [showAccessPaymentDialog, setShowAccessPaymentDialog] = useState(false);
  const [partPaymentDetails, setPartPaymentDetails] = useState<{ method: string; amount: number }[]>([]);
  const [discountReason, setDiscountReason] = useState('');
  const [deliveryCharge, setDeliveryCharge] = useState(() => {
    const saved = localStorage.getItem('pos_billing_delivery_charge');
    return saved ? Number(saved) : 0;
  });
  const [containerCharge, setContainerCharge] = useState(() => {
    const saved = localStorage.getItem('pos_billing_container_charge');
    return saved ? Number(saved) : 0;
  });
  const [tip, setTip] = useState(() => {
    const saved = localStorage.getItem('pos_billing_tip');
    return saved ? Number(saved) : 0;
  });
  const [showTaxDialog, setShowTaxDialog] = useState(false);
  const [showCustomItemDialog, setShowCustomItemDialog] = useState(false);
  const [addonParentForSheet, setAddonParentForSheet] = useState<CartItem | null>(null);
  const [showTableSelector, setShowTableSelector] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(selectedTable?.id || null);
  const [reserveDialogTableId, setReserveDialogTableId] = useState<string | null>(null);
  const [reserveForm, setReserveForm] = useState<{ name: string; phone: string; time: string; partySize: string; notes: string }>({ name: '', phone: '', time: '', partySize: '', notes: '' });

  const [selectedItemForVariation, setSelectedItemForVariation] = useState<MenuItem | null>(null);
  const [variationSheetOpen, setVariationSheetOpen] = useState(false);
  const [promptItem, setPromptItem] = useState<MenuItem | null>(null);
  const [showPaidConfirmDialog, setShowPaidConfirmDialog] = useState(false);
  const preparedPrintWindowRef = useRef<Window | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [isComplimentary, setIsComplimentary] = useState(false);
  const [complimentaryNote, setComplimentaryNote] = useState('');
  const [showComplimentaryDialog, setShowComplimentaryDialog] = useState(false);
  const [customer, setCustomer] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_billing_customer');
      return saved ? JSON.parse(saved) : { name: '', phone: '', email: '', address: '' };
    } catch {
      return { name: '', phone: '', email: '', address: '' };
    }
  });
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const { canAccess } = useSubscription();
  const { getSetting } = useStoreSettings();
  const printerSettings = getSetting<{ printBill?: boolean; printKOT?: boolean }>('pos_settings_printer') || { printBill: true, printKOT: true };

  const actionButtons = useMemo(() => {
    return getGroupButtons('cart_actions').filter(btn => {
      if (['discount', 'customer', 'qrMenu', 'qrOrders', 'heldBills'].includes(btn.id)) return false;
      if ((btn.id === 'kot' || btn.id === 'kotPrint') && !canAccess('kot')) return false;
      return true;
    });
  }, [getGroupButtons, canAccess]);

  // Sales Reset Warning - global listener
  const {
    showWarning: showSalesResetWarning,
    timeUntilReset,
    formattedResetTime,
    handleResetNow,
    handleExtendTime,
    dismissWarning: dismissSalesResetWarning,
  } = useSalesResetWarning();

  // Initialize barcode scanner for USB/wireless scanner support
  const { unmatchedCode, clearUnmatchedCode } = useBarcodeScanner();

  const filteredItems = useMemo(() => {
    const baseProducts = menuItems.filter(item => {
      const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
      const matchesSearch = !searchQuery || 
                           item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (item.sku && String(item.sku).toLowerCase().includes(searchQuery.toLowerCase())) ||
                           (item.barcode && String(item.barcode).toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch && item.isAvailable;
    });

    const othersItem: MenuItem = {
      id: `others-${activeCategory}`,
      name: 'Others',
      price: 0,
      category: activeCategory === 'all' ? 'others' : activeCategory,
      color: 'hsl(var(--card))',
      isAvailable: true,
    };

    return [othersItem, ...baseProducts];
  }, [menuItems, activeCategory, searchQuery]);

  const activeCategories = useMemo(() => {
    return categories.filter(cat => menuItems.some(item => item.category === cat.id));
  }, [categories, menuItems]);

  // Get available tables for dropdown
  const availableTables = tables.filter(t => t.status === 'available' || t.id === selectedTableId);

  const handleTableChange = (tableId: string) => {
    const table = tables.find(t => t.id === tableId);
    if (table) {
      setSelectedTable(table);
      setSelectedTableId(tableId);
    }
  };

  // Handle item click - check for variations
  const handleItemClick = (item: MenuItem) => {
    if (item.id.startsWith('others-')) {
      setShowCustomItemDialog(true);
      return;
    }

    // (Addons are added per cart item via the "+ Addons" button next to qty controls)

    if (!item.isAvailable) return;
    
    if (item.variations && item.variations.length > 0) {
      setSelectedItemForVariation(item);
      setVariationSheetOpen(true);
    } else if (item.preparationTime === 998 || item.preparationTime === 999) {
      setPromptItem(item);
    } else {
      addToCart(item);
    }
  };

  const handleAddCustomItem = (item: MenuItem, quantity: number) => {
    for (let i = 0; i < quantity; i++) {
      addToCart(item);
    }
  };

  const handleAddonsConfirm = (selected: Array<{ addon: Addon; quantity: number }>) => {
    const parent = addonParentForSheet;
    const parentKey = parent ? (parent.cartItemId || parent.id) : '';
    selected.forEach(({ addon, quantity }) => {
      const mi: MenuItem = {
        // encode parent linkage in id so each parent gets its own addon line
        id: `addon||${addon.id}||${parentKey}`,
        name: `+ ${addon.name}`,
        price: addon.price,
        category: addon.category || 'addons',
        color: 'hsl(var(--card))',
        isAvailable: true,
      };
      for (let i = 0; i < quantity; i++) addToCart(mi);
    });
  };

  const getAddonParentKey = (item: CartItem): string | null => {
    if (typeof item.id === 'string' && item.id.startsWith('addon||')) {
      const parts = item.id.split('||');
      return parts[2] || null;
    }
    return null;
  };


  // Handle variation selection from popup
  const handleVariationSelect = (item: MenuItem, variation?: MenuItemVariation, quantity: number = 1) => {
    const itemToAdd = variation ? {
      ...item,
      price: variation.price,
      name: `${item.name} (${variation.name})`,
      sku: variation.sku || item.sku,
    } : item;

    if (item.preparationTime === 998 || item.preparationTime === 999) {
      setPromptItem(itemToAdd);
    } else {
      for (let i = 0; i < quantity; i++) {
        addToCart(itemToAdd);
      }
    }
  };

  const allOrderTypes = [
    { id: 'takeaway' as const, label: t('pos.takeaway') },
    { id: 'delivery' as const, label: t('pos.delivery') },
  ];

  const orderTypes = allOrderTypes.filter(t => {
    if (t.id === 'takeaway' && !canAccess('takeaway')) return false;
    if (t.id === 'delivery' && !canAccess('delivery')) return false;
    return true;
  });


  // Calculate custom tax
  const calculatedTax = customTax !== null ? customTax : (cartSubtotal * taxPercent / 100);
  const adjustedTotal = cartSubtotal + calculatedTax - discount + deliveryCharge + containerCharge + tip;
  const finalTotal = isComplimentary ? 0 : adjustedTotal;
  const roundOff = Math.round(finalTotal) - finalTotal;

  const handlePaymentSelect = (method: 'cash' | 'card' | 'upi' | 'due' | 'part' | 'wallet' | 'credit' | 'access') => {
    setSelectedPayment(method);
  };

  const pendingAccessSaleRef = React.useRef<{ amount: number; subMethod: AccessPaySubMethod } | null>(null);
  const pendingAccessPrintWindowRef = React.useRef<Window | null>(null);
  const accessSubMethodRef = React.useRef<AccessPaySubMethod | null>(null);

  const handleAccessPaymentConfirm = (amount: number, subMethod: AccessPaySubMethod) => {
    handlePaymentSelect('access');
    accessSubMethodRef.current = subMethod;
    // Open print window synchronously while still inside user-gesture context
    // so the browser popup blocker doesn't block it.
    const printWindow = preparePrintWindow();
    if (!printWindow) return;

    if (cart.length === 0) {
      // No products selected → add a synthetic Access Payment line item, then sale.
      const accessItem: MenuItem = {
        id: `access-pay-${Date.now()}`,
        name: `Access Payment (${subMethod.toUpperCase()})`,
        price: amount,
        category: 'access',
        categoryId: activeCategory || 'access',
        description: 'Access payment entry',
        image: '',
        available: true,
        preparationTime: 999,
      } as any;
      pendingAccessSaleRef.current = { amount, subMethod };
      pendingAccessPrintWindowRef.current = printWindow;
      addToCart(accessItem, amount, 1);
    } else {
      // Cart already has items → just complete sale as Access Payment.
      setTimeout(() => completeSale('print', 'access', printWindow), 0);
    }
  };

  // When pending access sale flag is set and cart updates, trigger completeSale.
  useEffect(() => {
    if (pendingAccessSaleRef.current && cart.length > 0) {
      const printWindow = pendingAccessPrintWindowRef.current;
      pendingAccessSaleRef.current = null;
      pendingAccessPrintWindowRef.current = null;
      setTimeout(() => {
        completeSale('print', 'access', printWindow);
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.length]);



  const getStoreId = (): string => {
    try {
      const storeData = localStorage.getItem('pos_active_store_data');
      if (storeData) {
        const parsed = JSON.parse(storeData);
        return parsed?.id || parsed?.storeId || '';
      }
    } catch {}
    return '';
  };


  // Generate bill content for printing - using centralized template
  const generateBillContent = (order: any) => {
    return generateProfessionalBill({
      ...order,
      createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt
    });
  };

  // Generate KOT content for printing - using centralized template  
  const generateKOT = (order: any) => {
    return generateKOTContent({
      ...order,
      createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : (order.createdAt || new Date().toISOString()),
      subtotal: order.subtotal || 0,
      tax: order.tax || 0,
      discount: order.discount || 0,
      total: order.total || 0,
      paymentMethod: order.paymentMethod || 'cash'
    });
  };

  const preparePrintWindow = () => {
    console.log('[Print] Button clicked');

    const printWindow = window.open('', '_blank', 'width=420,height=800,menubar=no,toolbar=no,location=no,status=no');

    if (!printWindow) {
      alert('Please allow popups for printing');
      console.log('[Print] Popup blocked');
      return null;
    }

    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><title>Print Bill</title><style>@page{size:80mm auto;margin:2mm}body{font-family:monospace;padding:8px;margin:0}</style></head><body>Preparing bill...</body></html>`);
    printWindow.document.close();

    console.log('[Print] Window opened');
    return printWindow;
  };

  // Complete sale - called when Print/E-Bill or KOT is clicked (counts as sale)
  const completeSale = async (action: 'print' | 'kot', overridePayment?: typeof selectedPayment, existingPrintWindow?: Window | null) => {
    if (isProcessingSale) {
      existingPrintWindow?.close();
      return;
    }

    if (cart.length === 0) {
      toast({ title: t('msg.emptyCart'), description: t('msg.addItemsFirst'), variant: 'destructive' });
      existingPrintWindow?.close();
      return;
    }
    
    const paymentToUse = overridePayment || selectedPayment;
    if (!paymentToUse) {
      toast({ title: t('common.selectPayment'), description: t('msg.selectPaymentFirst'), variant: 'destructive' });
      existingPrintWindow?.close();
      return;
    }

    if (paymentToUse === 'credit') {
      if (!customer.name.trim() || !customer.phone.trim()) {
        toast({
          title: 'Customer Details Required',
          description: 'Please add Customer Name and Phone Number for credit (Khata) bills.',
          variant: 'destructive'
        });
        existingPrintWindow?.close();
        setShowCustomerDetails(true);
        return;
      }
    }

    if (currentOrderType === 'delivery') {
      if (!customer.name.trim() || !customer.phone.trim() || !customer.address.trim()) {
        toast({
          title: 'Delivery Details Required',
          description: 'Customer Name, Phone Number and Address are mandatory for delivery bills.',
          variant: 'destructive'
        });
        existingPrintWindow?.close();
        setShowCustomerDetails(true);
        return;
      }
    }


    setIsProcessingSale(true);
    try {
      const accessBreakdown = paymentToUse === 'access' && accessSubMethodRef.current
        ? [{ method: accessSubMethodRef.current, amount: cartTotal }]
        : undefined;
      const order = await directBillPrint(paymentToUse as any, {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
      }, paymentToUse === 'part' ? partPaymentDetails : accessBreakdown);

      if (order) {
        if (action === 'print') {
          const billContent = generateBillContent({
            ...order,
            paymentMethod: paymentToUse,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerEmail: customer.email,
            customerAddress: customer.address,
          });
          const kotContent = generateKOT(order);

          console.log('[Print] Bill HTML:', billContent);

          const shouldPrintBill = printerSettings.printBill !== false;
          const shouldPrintKOT = (printerSettings.printKOT !== false) && canAccess('kot');

          const handleAfterBillPrint = () => {
            if (customer.phone || customer.email) {
              autoShareBillAfterPrint({
                customerName: customer.name,
                customerPhone: customer.phone,
                customerEmail: customer.email,
                billNumber: order.billNumber || order.id.slice(-6).toUpperCase(),
                total: Math.round(finalTotal),
                items: order.items,
                subtotal: order.subtotal,
                tax: order.tax,
                discount: order.discount,
              });
            }

            if (shouldPrintKOT) {
              setTimeout(() => {
                directPrint(kotContent, () => {
                  toast({ title: t('msg.saleComplete'), description: `${t('pos.billNumber')} #${order.billNumber || order.id.slice(-6).toUpperCase()} - ${t('msg.billKotPrinted')}` });
                });
              }, 500);
            } else {
              toast({ title: t('msg.saleComplete'), description: `${t('pos.billNumber')} #${order.billNumber || order.id.slice(-6).toUpperCase()}` });
            }
          };

          if (shouldPrintBill) {
            directPrint(billContent, handleAfterBillPrint, existingPrintWindow);
          } else {
            existingPrintWindow?.close();
            handleAfterBillPrint();
          }
        } else if (action === 'kot') {
          const kotContent = generateKOT(order);
          const shouldPrintKOT = (printerSettings.printKOT !== false) && canAccess('kot');
          if (shouldPrintKOT) {
            directPrint(kotContent, () => {
              toast({ title: t('msg.saleComplete'), description: `${t('common.orderNo')} #${order.kotNumber || order.id.slice(-6).toUpperCase()} - ${t('msg.kotSentKitchen')}` });
            });
          } else {
            toast({ title: t('msg.saleComplete'), description: `${t('common.orderNo')} #${order.kotNumber || order.id.slice(-6).toUpperCase()}` });
          }
        }
        
        // Reset states
        setSelectedPayment(null);
        setDiscount(0);
        setDiscountReason('');
        setDeliveryCharge(0);
        setContainerCharge(0);
        setTip(0);
        setCustomer({ name: '', phone: '', email: '', address: '' });
        setPartPaymentDetails([]);
        setIsPaid(false);
        // Auto-revert to takeaway after each completed sale
        setCurrentOrderType('takeaway');
        setSelectedTable(null);
        setSelectedTableId(null);

      }
    } catch (error) {
      console.error('Error completing sale:', error);
      toast({ title: 'Error', description: 'Failed to complete sale. Please try again.', variant: 'destructive' });
      existingPrintWindow?.close();
    } finally {
      setIsProcessingSale(false);
    }
  };

  // KOT + Print: Only prints KOT, does NOT count as sale
  const printKOTOnly = () => {
    if (cart.length === 0) {
      toast({ title: t('msg.emptyCart'), description: t('msg.addItemsFirst'), variant: 'destructive' });
      return;
    }

    const kotOrder = {
      id: `KOT-${Date.now()}`,
      kotNumber: `KOT-${Date.now().toString().slice(-6)}`,
      items: cart,
      tableNumber: selectedTable?.number,
      orderType: currentOrderType,
    };

    const kotContent = generateKOT(kotOrder);
    const shouldPrintKOT = (printerSettings.printKOT !== false) && canAccess('kot');

    if (shouldPrintKOT) {
      directPrint(kotContent, () => {
        toast({ title: t('msg.kotPrinted'), description: t('msg.kotNotCountedAsSale') });
      });
    } else {
      toast({ title: 'KOT Saved', description: 'KOT saved successfully (printing is disabled)' });
    }
  };

  const handleHoldBill = () => {
    if (cart.length === 0) return;
    holdBill();
    toast({
      title: t('msg.billHeld'),
      description: t('msg.billSavedForLater'),
    });
    setSelectedPayment(null);
  };

  const { toggles: featureToggles } = useFeatureToggles();
  const handleSaveAsQuotation = async () => {
    if (cart.length === 0) {
      toast({ title: t('msg.emptyCart') || 'Cart is empty', description: 'Add items first', variant: 'destructive' });
      return;
    }
    const storeId = getActiveStore();
    if (!storeId) {
      toast({ title: 'No store selected', description: 'Select a store first', variant: 'destructive' });
      return;
    }
    try {
      const items: QuotationItem[] = cart.map((c: any) => computeItemTotal({
        product_id: c.id || null,
        product_name: c.name,
        sku: c.sku || null,
        quantity: Number(c.quantity || 1),
        price: Number(c.price || 0),
        discount: 0,
        tax_rate: Number(c.taxRate || 0),
        notes: c.notes || null,
      }));
      const totals = computeTotals(items);
      const qNo = generateQuotationNo();
      const expiry = new Date(); expiry.setDate(expiry.getDate() + 30);
      await saveQuotation(
        {
          store_id: storeId,
          quotation_no: qNo,
          customer_name: customer?.name || null,
          customer_phone: customer?.phone || null,
          customer_email: customer?.email || null,
          status: 'draft',
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          grand_total: totals.grand_total,
          expiry_date: expiry.toISOString(),
          notes: null,
        },
        items
      );
      toast({ title: 'Quotation Saved', description: `${qNo} created as draft` });
      clearCart();
      setSelectedPayment(null);
      setShowMorePayments(false);
      navigate('/quotations');
    } catch (e: any) {
      toast({ title: 'Failed to save quotation', description: e?.message || 'Try again', variant: 'destructive' });
    }
  };

  const handleApplyDiscount = (discountAmount: number, reason: string) => {
    setDiscount(discountAmount);
    setDiscountReason(reason);
    toast({ title: t('msg.discountApplied'), description: `${formatCurrency(discountAmount)} ${t('msg.discountAppliedAmount')}` });
  };

  const handleSplitConfirm = async (splits: any[]) => {
    const order = await directBillPrint('cash');
    if (order) {
      toast({ 
        title: t('msg.splitBillComplete'), 
        description: `${t('common.orderNo')} #${order.id.slice(-6)} ${t('msg.splitBetweenCustomers')} ${splits.length}` 
      });
      setSelectedPayment(null);
      setDiscount(0);
    }
  };

  // Automatically reset highlightedIndex to the first actual product in the list when filter results change
  useEffect(() => {
    if (filteredItems.length > 1) {
      setHighlightedIndex(1); // Default to index 1 (the first real product since index 0 is 'Others')
    } else if (filteredItems.length > 0) {
      setHighlightedIndex(0); // Default to 0 if only 'Others' is present
    } else {
      setHighlightedIndex(-1);
    }
  }, [filteredItems]);
  useEffect(() => {
    localStorage.setItem('pos_billing_customer', JSON.stringify(customer));
  }, [customer]);

  useEffect(() => {
    localStorage.setItem('pos_billing_delivery_charge', String(deliveryCharge));
  }, [deliveryCharge]);

  useEffect(() => {
    localStorage.setItem('pos_billing_container_charge', String(containerCharge));
  }, [containerCharge]);

  useEffect(() => {
    localStorage.setItem('pos_billing_tip', String(tip));
  }, [tip]);

  useEffect(() => {
    localStorage.setItem('pos_billing_search_query', searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (selectedPayment) {
      localStorage.setItem('pos_billing_selected_payment', selectedPayment);
    } else {
      localStorage.removeItem('pos_billing_selected_payment');
    }
  }, [selectedPayment]);
  const getButtonActions = useCallback(() => ({
    split: () => setShowSplitDialog(true),
    print: () => {
      if (cart.length === 0) { toast({ title: t('msg.emptyCart'), description: t('msg.addItemsFirst'), variant: 'destructive' }); return; }
      if (!selectedPayment) { toast({ title: t('common.selectPayment'), description: t('msg.selectPaymentFirst'), variant: 'destructive' }); return; }
      preparedPrintWindowRef.current?.close();
      preparedPrintWindowRef.current = preparePrintWindow();
      if (!preparedPrintWindowRef.current) return;
      const printWindow = preparedPrintWindowRef.current;
      preparedPrintWindowRef.current = null;
      completeSale('print', selectedPayment || 'cash', printWindow);
    },
    kot: () => completeSale('kot'),
    kotPrint: () => printKOTOnly(),
    hold: () => handleHoldBill(),
    discount: () => setShowDiscountDialog(true),
  }), [cart, selectedPayment, completeSale, printKOTOnly, handleHoldBill, t]);

  // Reset cartHighlightIndex when cart items decrease below the index
  useEffect(() => {
    if (cartHighlightIndex >= cart.length) {
      setCartHighlightIndex(Math.max(0, cart.length - 1));
    }
  }, [cart, cartHighlightIndex]);

  // Full Keyboard Billing & Custom Section-based Navigation
  useEffect(() => {
    const focusNextDetailedSection = (currentSection: string, forward: boolean) => {
      const sections = [
        'app-sidebar',
        'app-header',
        'categories-sidebar',
        'order-type-tabs',
        'products-search',
        'products-grid',
        'cart-header',
        'table-select',
        'cart-items',
        'show-details',
        'complimentary-paid',
        'payments',
        'actions'
      ];
      let idx = sections.indexOf(currentSection);
      if (idx === -1) idx = 0;
      
      // Try up to sections.length times to find a focusable section
      for (let i = 1; i <= sections.length; i++) {
        const nextIdx = (idx + (forward ? i : -i) + sections.length) % sections.length;
        const nextSec = sections[nextIdx];
        
        // Check if the section is present/visible/valid
        if (nextSec === 'app-sidebar') {
          const container = document.querySelector('aside');
          const firstBtn = container?.querySelector('a, button');
          if (firstBtn && (firstBtn as HTMLElement).offsetParent !== null) {
            (firstBtn as HTMLElement).focus();
            setActiveSection('products');
            return;
          }
        } else if (nextSec === 'app-header') {
          const header = document.querySelector('header');
          const firstBtn = header?.querySelector('button');
          if (firstBtn && firstBtn.offsetParent !== null) {
            firstBtn.focus();
            setActiveSection('products');
            return;
          }
        } else if (nextSec === 'categories-sidebar') {
          const container = document.getElementById('categories-sidebar');
          const activeBtn = container?.querySelector('.bg-primary') as HTMLElement || container?.querySelector('button');
          if (activeBtn && activeBtn.offsetParent !== null) {
            activeBtn.focus();
            setActiveSection('products');
            return;
          }
        } else if (nextSec === 'order-type-tabs') {
          const container = document.getElementById('order-type-tabs');
          const activeBtn = container?.querySelector('.bg-primary') as HTMLElement || container?.querySelector('button');
          if (activeBtn && activeBtn.offsetParent !== null) {
            activeBtn.focus();
            setActiveSection('products');
            return;
          }
        } else if (nextSec === 'products-search') {
          const el = document.getElementById('search-product-input');
          if (el && el.offsetParent !== null) {
            el.focus();
            setActiveSection('products');
            return;
          }
        } else if (nextSec === 'products-grid') {
          const items = Array.from(document.querySelectorAll('.menu-item')) as HTMLElement[];
          const target = items[highlightedIndex] || items[0];
          if (target && target.offsetParent !== null) {
            target.focus();
            setActiveSection('products');
            return;
          }
        } else if (nextSec === 'cart-header') {
          const container = document.getElementById('cart-header-actions');
          const firstBtn = container?.querySelector('button');
          if (firstBtn && firstBtn.offsetParent !== null) {
            firstBtn.focus();
            setActiveSection('cart');
            return;
          }
        } else if (nextSec === 'table-select') {
          const container = document.getElementById('table-select-container');
          const trigger = container?.querySelector('button');
          if (trigger && trigger.offsetParent !== null) {
            trigger.focus();
            setActiveSection('cart');
            return;
          }
        } else if (nextSec === 'cart-items') {
          const container = document.getElementById('right-billing-panel');
          const firstCartBtn = container?.querySelector('.cart-item button');
          if (firstCartBtn && (firstCartBtn as HTMLElement).offsetParent !== null) {
            (firstCartBtn as HTMLElement).focus();
            setActiveSection('cart');
            return;
          }
        } else if (nextSec === 'show-details') {
          const el = document.getElementById('show-details-btn');
          if (el && el.offsetParent !== null) {
            el.focus();
            setActiveSection('cart');
            return;
          }
        } else if (nextSec === 'complimentary-paid') {
          const container = document.getElementById('complimentary-paid-container');
          const firstInput = container?.querySelector('input');
          if (firstInput && firstInput.offsetParent !== null) {
            firstInput.focus();
            setActiveSection('cart');
            return;
          }
        } else if (nextSec === 'payments') {
          const container = document.getElementById('payments-section');
          const buttons = Array.from(container?.querySelectorAll('button') || []).filter(b => {
            const htmlEl = b as HTMLElement;
            return htmlEl.offsetParent !== null && !htmlEl.hasAttribute('disabled');
          });
          const targetBtn = buttons[paymentHighlightIndex] || buttons[0];
          if (targetBtn) {
            (targetBtn as HTMLElement).focus();
            setActiveSection('payments');
            return;
          }
        } else if (nextSec === 'actions') {
          const container = document.getElementById('actions-section');
          const buttons = Array.from(container?.querySelectorAll('button') || []).filter(b => {
            const htmlEl = b as HTMLElement;
            return htmlEl.offsetParent !== null && !htmlEl.hasAttribute('disabled');
          });
          const targetBtn = buttons[actionHighlightIndex] || buttons[0];
          if (targetBtn) {
            (targetBtn as HTMLElement).focus();
            setActiveSection('actions');
            return;
          }
        }
      }
    };

    const handleCartArrowNavigation = (direction: 'up' | 'down') => {
      const container = document.getElementById('right-billing-panel');
      if (!container) return;

      const focusables = Array.from(container.querySelectorAll('button, input, select, [tabindex="0"]'))
        .filter(el => {
          const htmlEl = el as HTMLElement;
          if (htmlEl.offsetParent === null) return false;
          if (htmlEl.hasAttribute('disabled')) return false;
          if (htmlEl.closest('#payments-section') || htmlEl.closest('#actions-section')) return false;
          return true;
        }) as HTMLElement[];

      if (focusables.length === 0) return;

      const activeEl = document.activeElement as HTMLElement;
      let currentIndex = focusables.indexOf(activeEl);

      // If focus is not inside the list, default to first or last depending on direction
      if (currentIndex === -1) {
        if (direction === 'down') {
          focusables[0].focus();
        } else {
          focusables[focusables.length - 1].focus();
        }
        return;
      }

      let nextIndex = direction === 'down' ? currentIndex + 1 : currentIndex - 1;
      // Circular wrap-around
      if (nextIndex >= focusables.length) {
        nextIndex = 0;
      } else if (nextIndex < 0) {
         nextIndex = focusables.length - 1;
      }

      focusables[nextIndex].focus();
    };

    const handlePaymentsArrowNavigation = (direction: 'next' | 'prev') => {
      const container = document.getElementById('payments-section');
      if (!container) return;

      const buttons = Array.from(container.querySelectorAll('button')).filter(b => !b.hasAttribute('disabled')) as HTMLElement[];
      if (buttons.length === 0) return;

      const activeEl = document.activeElement as HTMLElement;
      let currentIndex = buttons.indexOf(activeEl);

      if (currentIndex === -1) {
        buttons[0].focus();
        return;
      }

      let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex >= buttons.length) {
        nextIndex = 0;
      } else if (nextIndex < 0) {
        nextIndex = buttons.length - 1;
      }

      buttons[nextIndex].focus();
    };

    const handleActionsArrowNavigation = (direction: 'next' | 'prev') => {
      const container = document.getElementById('actions-section');
      if (!container) return;

      const buttons = Array.from(container.querySelectorAll('button')).filter(b => !b.hasAttribute('disabled')) as HTMLElement[];
      if (buttons.length === 0) return;

      const activeEl = document.activeElement as HTMLElement;
      let currentIndex = buttons.indexOf(activeEl);

      if (currentIndex === -1) {
        buttons[0].focus();
        return;
      }

      let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex >= buttons.length) {
        nextIndex = 0;
      } else if (nextIndex < 0) {
        nextIndex = buttons.length - 1;
      }

      buttons[nextIndex].focus();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.getAttribute('contenteditable') === 'true'
      );
      
      const isSearchInput = activeEl && (
        activeEl.id === 'search-product-input' ||
        activeEl.getAttribute('placeholder') === 'Search Product...'
      );

      // 1. Handle Tab / Shift+Tab globally (cycles detailed sections)
      if (e.key === 'Tab') {
        e.preventDefault();
        
        let currentSection = 'products-search';
        if (activeEl) {
          if (activeEl.closest('aside')) {
            currentSection = 'app-sidebar';
          } else if (activeEl.closest('header')) {
            currentSection = 'app-header';
          } else if (activeEl.closest('#categories-sidebar')) {
            currentSection = 'categories-sidebar';
          } else if (activeEl.closest('#order-type-tabs')) {
            currentSection = 'order-type-tabs';
          } else if (activeEl.id === 'search-product-input') {
            currentSection = 'products-search';
          } else if (activeEl.closest('.menu-item')) {
            currentSection = 'products-grid';
          } else if (activeEl.closest('#cart-header-actions')) {
            currentSection = 'cart-header';
          } else if (activeEl.closest('#table-select-container') || activeEl.id === 'table-select-container') {
            currentSection = 'table-select';
          } else if (activeEl.closest('.cart-item')) {
            currentSection = 'cart-items';
          } else if (activeEl.id === 'show-details-btn') {
            currentSection = 'show-details';
          } else if (activeEl.closest('#complimentary-paid-container') || activeEl.id === 'complimentary-paid-container') {
            currentSection = 'complimentary-paid';
          } else if (activeEl.closest('#payments-section')) {
            currentSection = 'payments';
          } else if (activeEl.closest('#actions-section')) {
            currentSection = 'actions';
          } else if (activeEl.closest('#right-billing-panel')) {
            currentSection = 'cart-items';
          }
        }
        
        focusNextDetailedSection(currentSection, true);
        return;
      }
      
      // If typing in other input elements (e.g. table number, customer details, discount), ignore other keyboard shortcuts
      if (isInput && !isSearchInput) {
        return;
      }

      // If F-key, prevent default browser actions
      if (e.key.startsWith('F')) {
        e.preventDefault();
      }

      // 2. Arrow Key Grid/List Navigation based on activeSection
      if (activeSection === 'products') {
        const isMenuOrSearch = activeEl && (
          activeEl.id === 'search-product-input' ||
          activeEl.closest('.menu-item') ||
          activeEl.getAttribute('placeholder') === 'Search Product...'
        );
        if (isMenuOrSearch) {
          const cols = uiConfig.layout.menuGridCols || 4;
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.min(filteredItems.length - 1, prev + 1));
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.max(0, prev - 1));
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.min(filteredItems.length - 1, prev + cols));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.max(0, prev - cols));
          }
        }
      } else if (activeSection === 'cart') {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          handleCartArrowNavigation('down');
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          handleCartArrowNavigation('up');
        }
      } else if (activeSection === 'payments') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          handlePaymentsArrowNavigation('next');
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          handlePaymentsArrowNavigation('prev');
        }
      } else if (activeSection === 'actions') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          handleActionsArrowNavigation('next');
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          handleActionsArrowNavigation('prev');
        }
      }

      // 3. Enter Selection based on activeSection
      if (e.key === 'Enter') {
        // If focusing a button, checkbox, select or link (except search input), let default click happen
        if (activeEl && activeEl !== document.body && activeEl.id !== 'search-product-input') {
          const tagName = activeEl.tagName;
          const typeAttr = activeEl.getAttribute('type');
          if (tagName === 'BUTTON' || tagName === 'SELECT' || tagName === 'A' || typeAttr === 'checkbox' || typeAttr === 'radio') {
            return;
          }
        }
        e.preventDefault();
        if (activeSection === 'products' || isSearchInput) {
          let selectedItem = null;
          // Check for exact SKU or barcode match first (case-insensitive, trimmed)
          const exactSkuMatch = menuItems.find(item => 
            (item.sku && item.sku.toLowerCase() === searchQuery.toLowerCase().trim()) ||
            (item.barcode && item.barcode.toLowerCase() === searchQuery.toLowerCase().trim())
          );
          if (exactSkuMatch) {
            selectedItem = exactSkuMatch;
          } else if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
            selectedItem = filteredItems[highlightedIndex];
          }
          if (selectedItem) {
            handleItemClick(selectedItem);
            setSearchQuery('');
            // Ensure focus stays in the search box
            const searchInput = document.querySelector('input[placeholder="Search Product..."]') as HTMLInputElement;
            if (searchInput) {
              setTimeout(() => searchInput.focus(), 10);
            }
          }
        } else if (activeSection === 'payments') {
          if (showMorePayments) {
            const sheetOptions: ('cash' | 'upi' | 'card' | 'due' | 'part' | 'wallet' | 'credit' | 'access')[] = ['cash', 'upi', 'card', 'due', 'part', 'wallet', 'credit', 'access'];
            const selectedOpt = sheetOptions[sheetPaymentHighlightIndex];
            if (selectedOpt === 'part') {
              setShowMorePayments(false);
              setShowPartPaymentDialog(true);
            } else {
              handlePaymentSelect(selectedOpt);
              setShowMorePayments(false);
            }
          } else {
            if (paymentHighlightIndex === 0) handlePaymentSelect('cash');
            else if (paymentHighlightIndex === 1) handlePaymentSelect('card');
            else if (paymentHighlightIndex === 2) handlePaymentSelect('upi');
            else if (paymentHighlightIndex === 3) {
              setShowMorePayments(true);
              setSheetPaymentHighlightIndex(0);
            }
          }
        } else if (activeSection === 'actions') {
          const btn = actionButtons[actionHighlightIndex];
          if (btn) {
            const buttonActions = getButtonActions();
            if (buttonActions[btn.id]) {
              buttonActions[btn.id]();
            }
          }
        }
        return;
      }

      // 4. Escape to clear/close
      if (e.key === 'Escape') {
        e.preventDefault();
        setSearchQuery('');
        setShowMorePayments(false);
        return;
      }

      // 5. Quantity / Item adjustments (+, -, Delete, Backspace)
      const targetCartItem = activeSection === 'cart' && cart.length > 0 
        ? cart[cartHighlightIndex] 
        : (cart.length > 0 ? cart[cart.length - 1] : null);

      if (targetCartItem) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          updateCartQuantity(targetCartItem.cartItemId || targetCartItem.id, targetCartItem.quantity + 1);
        } else if (e.key === '-') {
          e.preventDefault();
          if (targetCartItem.quantity > 1) {
            updateCartQuantity(targetCartItem.cartItemId || targetCartItem.id, targetCartItem.quantity - 1);
          } else {
            removeFromCart(targetCartItem.cartItemId || targetCartItem.id);
            if (activeSection === 'cart') {
              setCartHighlightIndex(prev => Math.max(0, prev - 1));
            }
          }
        } else if (e.key === 'Delete' || (e.key === 'Backspace' && !isInput)) {
          e.preventDefault();
          removeFromCart(targetCartItem.cartItemId || targetCartItem.id);
          if (activeSection === 'cart') {
            setCartHighlightIndex(prev => Math.max(0, prev - 1));
          }
        }
      }

      // 6. Keep F-keys shortcuts for power users (but remove Alt payment method shortcuts)
      if (e.key === 'F1') {
        if (cart.length > 0) completeSale('print', 'cash');
      } else if (e.key === 'F2') {
        if (cart.length > 0) completeSale('print', selectedPayment || 'cash');
      } else if (e.key === 'F3') {
        if (cart.length > 0) printKOTOnly();
      } else if (e.key === 'F6') {
        if (cart.length > 0) completeSale('kot', selectedPayment || 'cash');
      } else if (e.key === 'F9') {
        setCurrentOrderType('delivery');
      } else if (e.key === 'F11') {
        setCurrentOrderType('dine-in');
      } else if (e.key === 'F12') {
        setCurrentOrderType('takeaway');
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const activeEl = e.target as HTMLElement;
      if (!activeEl) return;

      if (activeEl.id === 'search-product-input' || activeEl.closest('.menu-item')) {
        setActiveSection('products');
        if (activeEl.closest('.menu-item')) {
          const menuItemsList = Array.from(document.querySelectorAll('.menu-item'));
          const index = menuItemsList.indexOf(activeEl.closest('.menu-item')!);
          if (index !== -1) {
            setHighlightedIndex(index);
          }
        }
      } else if (activeEl.closest('#payments-section')) {
        setActiveSection('payments');
        const paymentBtns = Array.from(document.querySelectorAll('#payments-section button'));
        const index = paymentBtns.indexOf(activeEl);
        if (index !== -1) {
          setPaymentHighlightIndex(index);
        }
      } else if (activeEl.closest('#actions-section')) {
        setActiveSection('actions');
        const actionBtns = Array.from(document.querySelectorAll('#actions-section button'));
        const index = actionBtns.indexOf(activeEl);
        if (index !== -1) {
          setActionHighlightIndex(index);
        }
      } else if (activeEl.closest('#right-billing-panel')) {
        setActiveSection('cart');
        const cartItemEl = activeEl.closest('.cart-item') as HTMLElement;
        if (cartItemEl && cartItemEl.dataset.cartIndex !== undefined) {
          setCartHighlightIndex(Number(cartItemEl.dataset.cartIndex));
        }
      } else if (activeEl.closest('#categories-sidebar') || activeEl.closest('#order-type-tabs') || activeEl.closest('header') || activeEl.closest('aside')) {
        setActiveSection('products');
      } else if (activeEl.id === 'show-details-btn' || activeEl.closest('#complimentary-paid-container') || activeEl.closest('#table-select-container') || activeEl.closest('#cart-header-actions')) {
        setActiveSection('cart');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('focusin', handleFocusIn);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('focusin', handleFocusIn);
    };
  }, [
    filteredItems,
    highlightedIndex,
    cart,
    cartHighlightIndex,
    paymentHighlightIndex,
    actionHighlightIndex,
    sheetPaymentHighlightIndex,
    selectedPayment,
    currentOrderType,
    uiConfig.layout.menuGridCols,
    completeSale,
    updateCartQuantity,
    removeFromCart,
    setCurrentOrderType,
    setSelectedPayment,
    handleHoldBill,
    t,
    setShowPartPaymentDialog,
    activeSection,
    showMorePayments,
    menuItems,
    searchQuery,
    actionButtons,
    getButtonActions,
    printKOTOnly
  ]);

  // Show simplified mobile layout on phones - AFTER all hooks
  if (isMobile) {
    return <MobilePOSPage />;
  }

  return (
    <>
    {/* Edit Mode Toolbar */}
    <EditModeToolbar
      isEditMode={editMode.isEditMode}
      onSave={() => {
        editMode.exitEditMode();
        sonnerToast.success('Layout saved successfully!');
      }}
      onCancel={() => {
        const snapshot = editMode.getSnapshot();
        if (snapshot) {
          updateConfig(snapshot);
        }
        editMode.exitEditMode();
        sonnerToast.info('Changes cancelled');
      }}
      onReset={() => {
        resetToDefault();
        editMode.markChanged();
        sonnerToast.success('Reset to default layout');
      }}
      onToggleEditMode={() => {
        if (editMode.isEditMode) {
          editMode.exitEditMode();
        } else {
          editMode.enterEditMode(uiConfig);
        }
      }}
      hasChanges={editMode.hasChanges}
    />

    {/* Edit Mode Inline Layout Panel */}
    {editMode.isEditMode && (
      <div className="fixed top-12 left-0 right-0 z-[99] bg-card border-b border-border shadow-md">
        <div className="flex items-center gap-6 px-4 py-2 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-fit">
            <span className="text-xs font-semibold text-muted-foreground">Menu:</span>
            <select
              value={uiConfig.layout.menuPosition}
              onChange={(e) => { updateLayout({ menuPosition: e.target.value as 'left' | 'right' }); editMode.markChanged(); }}
              className="h-7 text-xs rounded border border-border bg-background px-2"
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div className="flex items-center gap-2 min-w-fit">
            <span className="text-xs font-semibold text-muted-foreground">Order Panel:</span>
            <select
              value={uiConfig.layout.orderPanelPosition}
              onChange={(e) => { updateLayout({ orderPanelPosition: e.target.value as 'left' | 'right' }); editMode.markChanged(); }}
              className="h-7 text-xs rounded border border-border bg-background px-2"
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div className="flex items-center gap-2 min-w-fit">
            <span className="text-xs font-semibold text-muted-foreground">Grid:</span>
            <select
              value={String(uiConfig.layout.menuGridCols)}
              onChange={(e) => { updateLayout({ menuGridCols: Number(e.target.value) }); editMode.markChanged(); }}
              className="h-7 text-xs rounded border border-border bg-background px-2"
            >
              <option value="3">3 cols</option>
              <option value="4">4 cols</option>
              <option value="5">5 cols</option>
              <option value="6">6 cols</option>
            </select>
          </div>
          <div className="flex items-center gap-2 min-w-fit">
            <span className="text-xs font-semibold text-muted-foreground">Categories:</span>
            <select
              value={uiConfig.layout.categoryPosition}
              onChange={(e) => { updateLayout({ categoryPosition: e.target.value as 'left' | 'top' }); editMode.markChanged(); }}
              className="h-7 text-xs rounded border border-border bg-background px-2"
            >
              <option value="left">Left Sidebar</option>
              <option value="top">Top Bar</option>
            </select>
          </div>
          <label className="flex items-center gap-1.5 min-w-fit cursor-pointer">
            <input
              type="checkbox"
              checked={uiConfig.layout.showImages}
              onChange={(e) => { updateLayout({ showImages: e.target.checked }); editMode.markChanged(); }}
              className="w-3.5 h-3.5 rounded accent-primary"
            />
            <span className="text-xs font-semibold text-muted-foreground">Images</span>
          </label>
        </div>
      </div>
    )}

    <div className={cn("h-[calc(100vh-56px)] flex overflow-hidden", editMode.isEditMode && "mt-[88px] h-[calc(100vh-56px-88px)]")}>
      {/* Left Panel - Categories (Vertical) */}
      <div id="categories-sidebar" className="w-14 xl:w-20 bg-card border-r border-border flex flex-col overflow-hidden">
        <div className="px-0.5 py-1 flex-1 overflow-y-auto no-scrollbar">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'w-full px-0.5 py-1.5 rounded-lg text-center text-xs font-medium mb-1 transition-all',
              activeCategory === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-muted'
            )}
          >
            {t('common.all')}
          </button>
          {activeCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'w-full px-0.5 py-1.5 rounded-lg text-center mb-1 transition-all',
                activeCategory === cat.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary hover:bg-muted'
              )}
            >
              <span className="text-lg block mb-0.5">{cat.icon}</span>
              <span className="text-[11px] font-medium block truncate px-0">{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Center Panel - Menu Items */}
      <div className={cn("flex-1 flex flex-col overflow-hidden transition-all duration-200", activeSection === 'products' && "ring-2 ring-primary ring-inset bg-primary/[0.005]")}>
        {/* Order Type & Search */}
        <div className="p-3 bg-card border-b border-border space-y-3">
          {/* Order Type Tabs */}
          <div id="order-type-tabs" className="flex flex-wrap gap-1.5 items-center min-w-0">
            {orderTypes.map(type => (
              <button
                key={type.id}
                onClick={() => setCurrentOrderType(type.id)}
                className={cn(
                  'px-2.5 sm:px-3 lg:px-4 h-9 rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap shrink-0',
                  currentOrderType === type.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-muted'
                )}
              >
                {type.label}
              </button>
            ))}

            {canAccess('tableManagement') && canAccess('dineIn') && (
              <Button
                variant={currentOrderType === 'dine-in' ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'h-9 px-2.5 text-xs gap-1 shrink-0 whitespace-nowrap max-w-[160px] truncate',
                  currentOrderType === 'dine-in' && 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
                onClick={() => {
                  setCurrentOrderType('dine-in');
                  setShowTableSelector(true);
                }}
              >
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {currentOrderType === 'dine-in' && selectedTable
                    ? `${t('common.table')} ${selectedTable.number}`
                    : t('tables.selectTable')}
                </span>
              </Button>
            )}



            {/* Table Management sheet */}
            <Sheet open={showTableSelector} onOpenChange={setShowTableSelector}>
              <SheetContent side="bottom" className="h-[70vh] flex flex-col">
                <SheetHeader className="pb-2">
                  <SheetTitle className="text-xl">{t('tables.tableManagement')}</SheetTitle>
                  <p className="text-sm text-muted-foreground">Select a table to start order</p>
                </SheetHeader>

                {/* Legend */}
                <div className="flex items-center gap-4 px-1 pb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-success" />
                    <span className="text-xs text-muted-foreground">{t('tables.vacant')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-destructive" />
                    <span className="text-xs text-muted-foreground">{t('tables.occupied')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                    <span className="text-xs text-muted-foreground">{t('tables.reserved')}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {tables.map(table => {
                      const tableOrders = orders.filter(o => o.orderType === 'dine-in' && o.tableNumber === table.number);
                      const hasActiveOrder = tableOrders.some(o => ['pending', 'preparing', 'ready', 'completed'].includes(o.status));

                      let effectiveStatus: 'available' | 'occupied' | 'reserved' = 'available';
                      if (table.status === 'reserved') effectiveStatus = 'reserved';
                      else if (hasActiveOrder || table.status === 'occupied' || table.status === 'billed') effectiveStatus = 'occupied';

                      const isOccupied = effectiveStatus === 'occupied';
                      const isReserved = effectiveStatus === 'reserved';
                      const isSelected = table.id === selectedTableId;
                      const disabled = isOccupied && table.id !== selectedTableId;

                      const tone = isOccupied
                        ? { badge: 'bg-destructive/15 text-destructive', border: 'border-destructive/30', text: 'text-destructive' }
                        : isReserved
                          ? { badge: 'bg-warning/15 text-warning', border: 'border-warning/30', text: 'text-warning' }
                          : { badge: 'bg-success/15 text-success', border: 'border-success/30', text: 'text-success' };

                      const label = isOccupied ? t('tables.occupied') : isReserved ? t('tables.reserved') : t('tables.vacant');

                      return (
                        <div
                          key={table.id}
                          className={cn(
                            'relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                            isSelected ? 'ring-2 ring-primary ring-offset-1' : '',
                            tone.border,
                            disabled ? 'opacity-70' : 'hover:shadow-sm'
                          )}
                        >
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              handleTableChange(table.id);
                              setShowTableSelector(false);
                            }}
                            className={cn('flex flex-col items-center gap-2 w-full', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}
                          >
                            <span className={cn('w-10 h-10 flex items-center justify-center rounded-lg text-base font-bold', tone.badge)}>
                              {table.number}
                            </span>
                            <span className={cn('text-xs font-semibold', tone.text)}>
                              {label}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Users className="w-3 h-3" />
                              {table.capacity}
                            </span>
                          </button>

                          {isReserved && table.reservation && (
                            <div className="w-full text-[10px] text-center text-muted-foreground leading-tight border-t pt-1.5 mt-1">
                              <div className="font-semibold text-foreground truncate">{table.reservation.name}</div>
                              {table.reservation.phone && <div className="truncate">{table.reservation.phone}</div>}
                              {table.reservation.time && (
                                <div className="truncate">
                                  {new Date(table.reservation.time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex gap-1 w-full pt-1">
                            {effectiveStatus === 'available' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-7 text-[10px] gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReserveForm({ name: '', phone: '', time: '', partySize: String(table.capacity || ''), notes: '' });
                                  setReserveDialogTableId(table.id);
                                }}
                              >
                                <CalendarClock className="w-3 h-3" />
                                {t('tables.reserved')}
                              </Button>
                            )}
                            {(isOccupied || isReserved) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="flex-1 h-7 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateTableStatus(table.id, 'available', null);
                                  toast({ title: `Table ${table.number} freed` });
                                }}
                              >
                                <X className="w-3 h-3" />
                                Free
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* Reservation Dialog */}
            <Dialog open={!!reserveDialogTableId} onOpenChange={(open) => !open && setReserveDialogTableId(null)}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CalendarClock className="w-5 h-5" />
                    Reserve Table {tables.find(t => t.id === reserveDialogTableId)?.number}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="rsv-name">Name *</Label>
                    <Input id="rsv-name" value={reserveForm.name} onChange={(e) => setReserveForm({ ...reserveForm, name: e.target.value })} placeholder="Guest name" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="rsv-phone">Contact</Label>
                      <Input id="rsv-phone" value={reserveForm.phone} onChange={(e) => setReserveForm({ ...reserveForm, phone: e.target.value })} placeholder="Phone" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rsv-party">Party Size</Label>
                      <Input id="rsv-party" type="number" min={1} value={reserveForm.partySize} onChange={(e) => setReserveForm({ ...reserveForm, partySize: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rsv-time">Reservation Time</Label>
                    <Input id="rsv-time" type="datetime-local" value={reserveForm.time} onChange={(e) => setReserveForm({ ...reserveForm, time: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rsv-notes">Notes</Label>
                    <Input id="rsv-notes" value={reserveForm.notes} onChange={(e) => setReserveForm({ ...reserveForm, notes: e.target.value })} placeholder="Special requests" />
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setReserveDialogTableId(null)}>Cancel</Button>
                  <Button
                    onClick={() => {
                      if (!reserveForm.name.trim()) {
                        toast({ title: 'Name is required', variant: 'destructive' });
                        return;
                      }
                      if (!reserveDialogTableId) return;
                      const t = tables.find(t => t.id === reserveDialogTableId);
                      updateTableStatus(reserveDialogTableId, 'reserved', {
                        name: reserveForm.name.trim(),
                        phone: reserveForm.phone.trim() || undefined,
                        time: reserveForm.time ? new Date(reserveForm.time).toISOString() : undefined,
                        partySize: reserveForm.partySize ? Number(reserveForm.partySize) : undefined,
                        notes: reserveForm.notes.trim() || undefined,
                      });
                      toast({ title: `Table ${t?.number} reserved for ${reserveForm.name}` });
                      setReserveDialogTableId(null);
                    }}
                  >
                    Reserve
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>


            {selectedTable && (
              <div className="ml-auto px-3 py-2 bg-success/10 text-success rounded-lg text-sm font-medium">
                {t('common.table')} {selectedTable.number}
              </div>
            )}
          </div>

          {/* Search with Barcode Scanner */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="search-product-input"
                placeholder="Search Product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setActiveSection('products')}
                className="pl-10 h-10"
              />
            </div>
            {/* Barcode Scanner Button - hidden for basic plan */}
            {canAccess('barcodeScanner') && (
              <BarcodeButton size="default" className="h-10 px-3" showLabel />
            )}
          </div>
        </div>

        {/* Menu Grid */}
        <div className="flex-1 overflow-auto p-3">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${uiConfig.layout.menuGridCols}, minmax(0, 1fr))`,
            }}
          >
            {filteredItems.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => {
                  setHighlightedIndex(idx);
                  handleItemClick(item);
                }}
                className={cn(
                  'menu-item text-left relative rounded-2xl bg-card overflow-hidden ring-1 ring-border transition-all duration-150 p-0',
                  idx === highlightedIndex
                    ? 'ring-4 ring-primary border-primary bg-primary/5 scale-[1.02] shadow-md z-10'
                    : item.id.startsWith('others-')
                      ? 'ring-2 ring-dashed ring-primary/30 hover:ring-primary p-3'
                      : 'text-foreground shadow-sm hover:ring-primary hover:shadow-md'
                )}
              >
                {item.id.startsWith('others-') ? (
                  <div className="flex h-full min-h-[60px] flex-col items-center justify-center gap-1 text-center">
                    <PackagePlus className="w-6 h-6 text-primary" />
                    <h4 className="font-medium text-xs">Others</h4>
                    <p className="text-[10px] text-muted-foreground">Custom item</p>
                  </div>
                ) : (
                  <>
                    {/* Variation indicator */}
                    {item.variations && item.variations.length > 0 && (
                      <div className="absolute top-1.5 right-1.5 z-10 rounded-full bg-primary p-1 text-primary-foreground">
                        <Layers className="w-2.5 h-2.5" />
                      </div>
                    )}
                    {/* Image area - square, full width */}
                    <div className="w-full aspect-square bg-muted/80 flex items-center justify-center relative">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <ShoppingBag className="w-10 h-10 text-muted-foreground/40" />
                      )}
                      {/* Add button */}
                      <div className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
                        <Plus className="w-4 h-4" />
                      </div>
                    </div>
                    {/* Name & price */}
                    <div className="p-2.5">
                      <h4 className="font-semibold text-xs leading-snug break-words whitespace-normal text-foreground">{item.name}</h4>
                      {item.variations && item.variations.length > 0 ? (
                        <p className="text-sm font-bold text-primary mt-1">
                          {formatCurrency(Math.min(item.price || Infinity, ...item.variations.map(v => v.price)))}+
                        </p>
                      ) : (
                        <p className="text-sm font-bold text-primary mt-1">{formatCurrency(item.price)}</p>
                      )}
                    </div>
                  </>
                )}
              </button>
            ))}
          </div>

          {filteredItems.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {t('common.noItemsFound')}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Cart & Billing */}
      <div id="right-billing-panel" className="w-[clamp(360px,42vw,600px)] flex-shrink-0 overflow-hidden border-l border-border bg-card flex flex-col">
        {/* Cart Header with Table Select */}
        <div className="p-1 pr-2 border-b border-border space-y-1">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <h2 className="font-semibold text-sm whitespace-nowrap">{t('common.currentOrder')}</h2>
            <TooltipProvider delayDuration={300}>
               <div id="cart-header-actions" className="ml-auto flex min-w-0 items-center gap-1 flex-nowrap">
                {isButtonVisible('customer') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                     <Button
                      variant="default"
                      size="icon"
                      className="h-10 w-10 xl:h-14 xl:w-14 flex-shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => setShowCustomerDetails(!showCustomerDetails)}
                    >
                      <User className="w-5 h-5 xl:w-[26px] xl:h-[26px]" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>{customer.name || t('common.contact') || 'Contact'}</p></TooltipContent>
                </Tooltip>
                )}
                {isButtonVisible('heldBills') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="icon"
                      className="h-10 w-10 xl:h-14 xl:w-14 flex-shrink-0 relative bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => {
                        if (showHeldBills) {
                          setSelectedHeldBillIds([]);
                        }
                        setShowHeldBills(!showHeldBills);
                      }}
                    >
                      <Play className="w-5 h-5 xl:w-[26px] xl:h-[26px]" />
                      {heldBills.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-white text-primary text-[10px] rounded-full flex items-center justify-center font-bold">
                          {heldBills.length}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>{t('common.recall')}</p></TooltipContent>
                </Tooltip>
                )}
                {isButtonVisible('qrMenu') && canAccess('qrMenuOrdering') && <QRMenuGenerator className="h-10 w-10 xl:h-14 xl:w-14" iconClassName="w-5 h-5 xl:w-[26px] xl:h-[26px]" />}
                {isButtonVisible('qrOrders') && canAccess('qrMenuOrdering') && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="default"
                        size="icon"
                        className="h-10 w-10 xl:h-14 xl:w-14 flex-shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => setShowQROrders(true)}
                      >
                        <QrCode className="w-5 h-5 xl:w-[26px] xl:h-[26px]" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p>Orders</p></TooltipContent>
                  </Tooltip>
                )}
                {/* UI Customization - Edit Mode Toggle + Settings */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="icon"
                      className={cn("h-10 w-10 xl:h-14 xl:w-14 flex-shrink-0 bg-primary text-primary-foreground hover:bg-primary/90", editMode.isEditMode && "animate-pulse")}
                      onClick={() => {
                        if (editMode.isEditMode) {
                          editMode.exitEditMode();
                        } else {
                          editMode.enterEditMode(uiConfig);
                        }
                      }}
                    >
                      <Pencil className="w-5 h-5 xl:w-[26px] xl:h-[26px]" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>{editMode.isEditMode ? 'Exit Edit Mode' : 'Edit UI Layout'}</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="icon"
                      className="h-10 w-10 xl:h-14 xl:w-14 flex-shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => navigate('/ui-customization')}
                    >
                      <Settings className="w-5 h-5 xl:w-[26px] xl:h-[26px]" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>All Settings</p></TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>

        </div>

        {/* Customer Details */}
        <CustomerDetails 
          customer={customer} 
          onChange={setCustomer}
          orderType={currentOrderType}
          isOpen={showCustomerDetails}
          onToggle={() => setShowCustomerDetails(false)}
        />

        {/* Held Bills Dropdown */}
        {showHeldBills && heldBills.length > 0 && (
          <div className="p-3 bg-secondary/50 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{t('common.heldBills').toUpperCase()}</p>
              {selectedHeldBillIds.length >= 2 && (
                <Button
                  size="sm"
                  className="h-7 text-[10px] px-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => {
                    mergeBills(selectedHeldBillIds);
                    setSelectedHeldBillIds([]);
                    setShowHeldBills(false);
                  }}
                >
                  {t('common.mergeSelected')}
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">{t('common.selectBillsToMerge')}</p>
            {heldBills.map(bill => {
              const isSelected = selectedHeldBillIds.includes(bill.id);
              return (
                <div
                  key={bill.id}
                  className={cn(
                    "flex items-center gap-2 w-full text-left p-2 bg-card rounded-lg border transition-colors",
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      setSelectedHeldBillIds(prev =>
                        e.target.checked
                          ? [...prev, bill.id]
                          : prev.filter(id => id !== bill.id)
                      );
                    }}
                    className="w-4 h-4 rounded border-border accent-primary"
                  />
                  <button
                    onClick={() => {
                      recallBill(bill.id);
                      setShowHeldBills(false);
                      setSelectedHeldBillIds([]);
                    }}
                    className="flex-1 text-left"
                  >
                    <div className="flex justify-between text-sm">
                      <span>{bill.tableNumber ? `${t('common.table')} ${bill.tableNumber}` : t('pos.takeaway')}</span>
                      <span className="font-medium">{bill.items.length} {t('common.items')}</span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Cart Items */}
        <div className={cn("flex-1 min-h-[60px] overflow-y-auto p-1 space-y-1 transition-all duration-200", activeSection === 'cart' && "ring-2 ring-primary ring-inset bg-primary/[0.005]")}>
          {cart.length === 0 ? (
            <div className="flex min-h-[60px] items-center justify-center text-center text-muted-foreground text-sm">
              {t('pos.emptyCart')}
            </div>
          ) : (
            (() => {
              // group addons under their parent cart item
              const addonsByParent: Record<string, CartItem[]> = {};
              const topLevel: CartItem[] = [];
              cart.forEach((it) => {
                const p = getAddonParentKey(it);
                if (p) {
                  (addonsByParent[p] ||= []).push(it);
                } else {
                  topLevel.push(it);
                }
              });
              return topLevel.map((item, index) => {
                const isHighlighted = activeSection === 'cart' && cartHighlightIndex === index;
                const parentKey = item.cartItemId || item.id;
                const childAddons = addonsByParent[parentKey] || [];
                return (
                  <div key={parentKey} className="space-y-1">
                    <div
                      data-cart-index={index}
                      className={cn(
                        "cart-item flex items-center gap-2 rounded-lg border bg-card p-2 text-foreground transition-all duration-200",
                        isHighlighted ? "border-primary ring-2 ring-primary/40 bg-primary/5 scale-[1.01]" : "border-border"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs leading-tight break-words text-foreground">
                          <span>{item.name}</span>
                          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                            {formatCurrency(item.price)} × {item.quantity}
                          </span>
                        </p>
                        {childAddons.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-tight text-muted-foreground">
                            {childAddons.map((addon) => {
                              const addonKey = addon.cartItemId || addon.id;
                              const displayName = (addon.name || '').replace(/^\+\s*/, '');
                              return (
                                <span key={addonKey} className="inline-flex items-center gap-1">
                                  <span>+ {displayName} {formatCurrency(addon.price)} ×{addon.quantity}</span>
                                  <button
                                    onClick={() => removeFromCart(addonKey)}
                                    className="text-destructive hover:text-destructive/80"
                                    title="Remove addon"
                                  >
                                    ✕
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateCartQuantity(parentKey, item.quantity - 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-xs font-medium text-foreground">{item.quantity}</span>
                        <button
                          onClick={() => updateCartQuantity(parentKey, item.quantity + 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setAddonParentForSheet(item)}
                          title="Add addons"
                          className="ml-1 flex h-8 items-center justify-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 text-[10px] font-semibold text-primary hover:bg-primary/10"
                        >
                          <Plus className="w-3 h-3" /> Addons
                        </button>
                        <button
                          onClick={() => removeFromCart(parentKey)}
                          className="ml-1 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-destructive hover:bg-muted"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                  </div>
                );
              });
            })()
          )}
        </div>


        <div className="border-t border-border bg-card">
        {/* Billing Summary Swipe Up */}
        <div>
          {/* Toggle Button */}
          <button
            id="show-details-btn"
            onClick={() => setShowBillingSummary(!showBillingSummary)}
            className="w-full py-2 px-2 flex items-center justify-center gap-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {showBillingSummary ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            {showBillingSummary ? t('common.hideDetails') : t('common.showDetails')}
          </button>

          {/* Expandable Summary */}
          {showBillingSummary && (
            <div className="space-y-1 border-t border-border bg-secondary/30 p-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('common.subtotal')}</span>
                <span>{formatCurrency(cartSubtotal)}</span>
              </div>
              
              <div className="flex justify-between items-center text-sm">
                <button 
                  onClick={() => setShowDiscountDialog(true)}
                  className="text-muted-foreground flex items-center gap-1 hover:text-foreground"
                >
                  <Percent className="w-3 h-3" />
                  {t('common.discount')}
                  <span className="text-xs bg-primary/10 text-primary px-1 rounded">{t('common.more')}</span>
                </button>
                <span className="text-destructive">-{formatCurrency(discount)}</span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{t('pos.deliveryCharge')}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setDeliveryCharge(Math.max(0, deliveryCharge - 10))} className="w-5 h-5 rounded bg-muted flex items-center justify-center">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-12 text-center">{formatCurrency(deliveryCharge)}</span>
                  <button onClick={() => setDeliveryCharge(deliveryCharge + 10)} className="w-5 h-5 rounded bg-muted flex items-center justify-center">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{t('pos.containerCharge')}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setContainerCharge(Math.max(0, containerCharge - 5))} className="w-5 h-5 rounded bg-muted flex items-center justify-center">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-12 text-center">{formatCurrency(containerCharge)}</span>
                  <button onClick={() => setContainerCharge(containerCharge + 5)} className="w-5 h-5 rounded bg-muted flex items-center justify-center">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center text-sm">
                <button 
                  onClick={() => setShowTaxDialog(true)}
                  className="text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <Receipt className="w-3 h-3" />
                  Tax ({taxPercent}%)
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20">Edit</span>
                </button>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => {
                      const newTax = Math.max(0, calculatedTax - 10);
                      setCustomTax(newTax);
                    }} 
                    className="w-5 h-5 rounded bg-muted flex items-center justify-center hover:bg-muted-foreground/20"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-14 text-center">{formatCurrency(calculatedTax)}</span>
                  <button 
                    onClick={() => {
                      const newTax = calculatedTax + 10;
                      setCustomTax(newTax);
                    }} 
                    className="w-5 h-5 rounded bg-muted flex items-center justify-center hover:bg-muted-foreground/20"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('common.roundOff')}</span>
                <span>{roundOff >= 0 ? '+' : ''}{formatCurrency(roundOff)}</span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{t('pos.tip')}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setTip(Math.max(0, tip - 10))} className="w-5 h-5 rounded bg-muted flex items-center justify-center">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-12 text-center">{formatCurrency(tip)}</span>
                  <button onClick={() => setTip(tip + 10)} className="w-5 h-5 rounded bg-muted flex items-center justify-center">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Complimentary, Paid, Total & Amount in one line */}
          <div className="flex items-center justify-between border-t border-border p-1.5">
            <div id="complimentary-paid-container" className="flex items-center gap-3">
              <label className="flex items-center gap-1 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isComplimentary}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setShowComplimentaryDialog(true);
                    } else {
                      setIsComplimentary(false);
                      setComplimentaryNote('');
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-border accent-primary" 
                />
                <span className="text-[10px] font-bold text-foreground">{t('common.complimentary')}</span>
              </label>

              <label className="flex items-center gap-1 cursor-pointer border-l border-border pl-3">
                <input 
                  type="checkbox" 
                  checked={isPaid}
                  onChange={(e) => setIsPaid(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-border accent-primary" 
                />
                <span className="text-[10px] font-bold text-foreground">Paid</span>
              </label>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold">
              <span>{t('common.total')}</span>
              <span className={cn("text-primary", isComplimentary && "line-through text-muted-foreground")}>
                {formatCurrency(Math.round(isComplimentary ? cartTotal : finalTotal))}
              </span>
              {isComplimentary && (
                <span className="text-success">₹0</span>
              )}
            </div>
          </div>

          {/* Payment Methods */}
          <div id="payments-section" className={cn("border-t border-border p-1.5 transition-all duration-200", activeSection === 'payments' && "ring-2 ring-primary ring-inset bg-primary/[0.005]")}>
            
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => handlePaymentSelect('cash')}
                disabled={cart.length === 0}
                className={cn(
                  'h-9 rounded-xl flex items-center justify-center gap-2 border shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-xs font-semibold font-semibold bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                  selectedPayment === 'cash' && 'ring-2 ring-primary-foreground/60 ring-offset-2 ring-offset-background',
                  activeSection === 'payments' && paymentHighlightIndex === 0 && 'ring-2 ring-primary ring-offset-1 scale-[1.02]',
                  cart.length === 0 && 'opacity-50 cursor-not-allowed'
                )}
              >
                  <Banknote className="w-4 h-4" />
                  <span>{t('pos.cash')}</span>
              </button>
              <button
                onClick={() => handlePaymentSelect('card')}
                disabled={cart.length === 0}
                className={cn(
                  'h-9 rounded-xl flex items-center justify-center gap-2 border shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-xs font-semibold font-semibold bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                  selectedPayment === 'card' && 'ring-2 ring-primary-foreground/60 ring-offset-2 ring-offset-background',
                  activeSection === 'payments' && paymentHighlightIndex === 1 && 'ring-2 ring-primary ring-offset-1 scale-[1.02]',
                  cart.length === 0 && 'opacity-50 cursor-not-allowed'
                )}
              >
                  <CreditCard className="w-4 h-4" />
                  <span>{t('pos.card')}</span>
              </button>
              <button
                onClick={() => handlePaymentSelect('upi')}
                disabled={cart.length === 0}
                className={cn(
                  'h-9 rounded-xl flex items-center justify-center gap-2 border shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-xs font-semibold font-semibold bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                  selectedPayment === 'upi' && 'ring-2 ring-primary-foreground/60 ring-offset-2 ring-offset-background',
                  activeSection === 'payments' && paymentHighlightIndex === 2 && 'ring-2 ring-primary ring-offset-1 scale-[1.02]',
                  cart.length === 0 && 'opacity-50 cursor-not-allowed'
                )}
              >
                  <Smartphone className="w-4 h-4" />
                  <span>{t('pos.upi')}</span>
              </button>
              <button
                onClick={() => setShowMorePayments(true)}
                className={cn(
                  'h-9 rounded-xl flex items-center justify-center gap-2 border shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-xs font-semibold font-semibold bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                  ['due', 'part', 'wallet', 'credit', 'access'].includes(selectedPayment || '') && 'ring-2 ring-primary-foreground/60 ring-offset-2 ring-offset-background',
                  activeSection === 'payments' && paymentHighlightIndex === 3 && 'ring-2 ring-primary ring-offset-1 scale-[1.02]'
                )}
              >
                  <MoreHorizontal className="w-4 h-4" />
                  <span>{t('common.more')}</span>
              </button>

            </div>
          </div>

          {/* Action Buttons - Drag & Drop in Edit Mode */}
          <div id="actions-section" className={cn("border-t border-border p-2.5", editMode.isEditMode && "ring-2 ring-primary/30 ring-inset bg-primary/5 relative")}>
            {editMode.isEditMode && (
              <div className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5">⚡ Action Buttons — Drag to reorder</div>
            )}
            <DraggableButtonGrid
              buttons={actionButtons}
              isEditMode={editMode.isEditMode}
              onReorder={(from, to) => {
                const fromBtn = actionButtons[from];
                const toBtn = actionButtons[to];
                const allCartButtons = getGroupButtons('cart_actions');
                const fromIndex = allCartButtons.findIndex(b => b.id === fromBtn.id);
                const toIndex = allCartButtons.findIndex(b => b.id === toBtn.id);
                if (fromIndex !== -1 && toIndex !== -1) {
                  reorderButtons('cart_actions', fromIndex, toIndex);
                  editMode.markChanged();
                }
              }}
              onToggleVisibility={(id) => {
                toggleButton(id);
                editMode.markChanged();
              }}
              renderButton={(btn, idx) => {
                const buttonActions: Record<string, () => void> = {
                  split: () => setShowSplitDialog(true),
                  print: () => {
                    if (cart.length === 0) { toast({ title: t('msg.emptyCart'), description: t('msg.addItemsFirst'), variant: 'destructive' }); return; }
                    if (!selectedPayment) { toast({ title: t('common.selectPayment'), description: t('msg.selectPaymentFirst'), variant: 'destructive' }); return; }
                    preparedPrintWindowRef.current?.close();
                    preparedPrintWindowRef.current = preparePrintWindow();
                    if (!preparedPrintWindowRef.current) return;
                    const printWindow = preparedPrintWindowRef.current;
                    preparedPrintWindowRef.current = null;
                    completeSale('print', selectedPayment || 'cash', printWindow);
                  },
                  kot: () => completeSale('kot'),
                  kotPrint: () => printKOTOnly(),
                  hold: () => handleHoldBill(),
                  discount: () => setShowDiscountDialog(true),
                };
                const iconMap: Record<string, React.ReactNode> = {
                  split: <Scissors className="w-4 h-4" />,
                  print: <Printer className="w-4 h-4" />,
                  kot: <FileText className="w-4 h-4" />,
                  kotPrint: <Receipt className="w-4 h-4" />,
                  hold: <Pause className="w-4 h-4" />,
                  discount: <Percent className="w-4 h-4" />,
                };
                const isActionBtn = ['print', 'kot', 'kotPrint'].includes(btn.id);
                const isHighlighted = activeSection === 'actions' && actionHighlightIndex === idx;
                const colors = { bg: 'bg-primary text-primary-foreground border-primary hover:bg-primary/90', ring: 'ring-primary-foreground/60', ringColor: 'ring-primary' };
                return (
                  <Button
                    variant="default"
                    size="default"
                    onClick={buttonActions[btn.id] || (() => {})}
                    disabled={cart.length === 0 || isProcessingSale}
                    className={cn(
                      "h-9 w-full gap-2 px-3 text-xs md:text-sm font-semibold shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] rounded-xl",
                      colors.bg,
                      isHighlighted && `ring-2 ${colors.ring} ring-offset-2 ring-offset-background scale-[1.02]`
                    )}
                  >
                    {iconMap[btn.id]}
                    {btn.label}
                  </Button>
                );

              }}
            />
          </div>
          </div>
        </div>
        </div>
      </div>

      {/* Split Bill Dialog */}
      <SplitBillDialog
        open={showSplitDialog}
        onOpenChange={setShowSplitDialog}
        totalAmount={Math.round(finalTotal)}
        onConfirm={handleSplitConfirm}
      />

      {/* Discount Dialog */}
      <DiscountDialog
        open={showDiscountDialog}
        onOpenChange={setShowDiscountDialog}
        subtotal={cartSubtotal}
        currentDiscount={discount}
        onApplyDiscount={handleApplyDiscount}
      />

      <CustomItemDialog
        open={showCustomItemDialog}
        onOpenChange={setShowCustomItemDialog}
        onAdd={handleAddCustomItem}
        categoryId={activeCategory}
      />

      <AddonSelectorSheet
        isOpen={!!addonParentForSheet}
        parentName={addonParentForSheet?.name || ''}
        onClose={() => setAddonParentForSheet(null)}
        onConfirm={handleAddonsConfirm}
      />

      {/* Variation Selector Sheet */}
      <VariationSelectorSheet
        item={selectedItemForVariation}
        isOpen={variationSheetOpen}
        onClose={() => {
          setVariationSheetOpen(false);
          setSelectedItemForVariation(null);
        }}
        onSelect={handleVariationSelect}
      />

      {/* More Payment Methods Sheet */}
      <Sheet open={showMorePayments} onOpenChange={setShowMorePayments}>
        <SheetContent side="bottom" className="h-auto max-h-[50vh]">
          <SheetHeader className="pb-4">
            <SheetTitle>{t('common.paymentOptions')}</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-4 gap-3 pb-4">
            {/* Cash */}
            <button
              onClick={() => {
                handlePaymentSelect('cash');
                setShowMorePayments(false);
              }}
              disabled={cart.length === 0}
              className={cn(
                'h-16 rounded-lg flex flex-col items-center justify-center gap-1 border-2 transition-all bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                selectedPayment === 'cash' && 'ring-2 ring-primary-foreground/60 ring-offset-2 ring-offset-background',
                activeSection === 'payments' && showMorePayments && sheetPaymentHighlightIndex === 0 && 'ring-2 ring-primary ring-offset-1 scale-[1.02]',
                cart.length === 0 && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Banknote className="w-5 h-5" />
              <span className="text-sm font-medium">{t('pos.cash')}</span>
            </button>
            
            {/* UPI */}
            <button
              onClick={() => {
                handlePaymentSelect('upi');
                setShowMorePayments(false);
              }}
              disabled={cart.length === 0}
              className={cn(
                'h-16 rounded-lg flex flex-col items-center justify-center gap-1 border-2 transition-all bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                selectedPayment === 'upi' && 'ring-2 ring-primary-foreground/60 ring-offset-2 ring-offset-background',
                activeSection === 'payments' && showMorePayments && sheetPaymentHighlightIndex === 1 && 'ring-2 ring-primary ring-offset-1 scale-[1.02]',
                cart.length === 0 && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Smartphone className="w-5 h-5" />
              <span className="text-sm font-medium">{t('pos.upi')}</span>
            </button>
            
            {/* Card */}
            <button
              onClick={() => {
                handlePaymentSelect('card');
                setShowMorePayments(false);
              }}
              disabled={cart.length === 0}
              className={cn(
                'h-16 rounded-lg flex flex-col items-center justify-center gap-1 border-2 transition-all bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                selectedPayment === 'card' && 'ring-2 ring-primary-foreground/60 ring-offset-2 ring-offset-background',
                activeSection === 'payments' && showMorePayments && sheetPaymentHighlightIndex === 2 && 'ring-2 ring-primary ring-offset-1 scale-[1.02]',
                cart.length === 0 && 'opacity-50 cursor-not-allowed'
              )}
            >
              <CreditCard className="w-5 h-5" />
              <span className="text-sm font-medium">{t('pos.card')}</span>
            </button>
            
            {/* Due removed as it is duplicate of Credit */}

            {/* Part Payment */}
            <button
              onClick={() => {
                setShowMorePayments(false);
                setShowPartPaymentDialog(true);
              }}
              disabled={cart.length === 0}
              className={cn(
                'h-16 rounded-lg flex flex-col items-center justify-center gap-1 border-2 transition-all bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                selectedPayment === 'part' && 'ring-2 ring-primary-foreground/60 ring-offset-2 ring-offset-background',
                activeSection === 'payments' && showMorePayments && sheetPaymentHighlightIndex === 4 && 'ring-2 ring-primary ring-offset-1 scale-[1.02]',
                cart.length === 0 && 'opacity-50 cursor-not-allowed'
              )}
            >
              <SplitSquareHorizontal className="w-5 h-5" />
              <span className="text-sm font-medium">{t('common.partPayment')}</span>
            </button>

            {/* Wallet */}
            <button
              onClick={() => {
                handlePaymentSelect('wallet');
                setShowMorePayments(false);
              }}
              disabled={cart.length === 0}
              className={cn(
                'h-16 rounded-lg flex flex-col items-center justify-center gap-1 border-2 transition-all bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                selectedPayment === 'wallet' && 'ring-2 ring-primary-foreground/60 ring-offset-2 ring-offset-background',
                activeSection === 'payments' && showMorePayments && sheetPaymentHighlightIndex === 5 && 'ring-2 ring-primary ring-offset-1 scale-[1.02]',
                cart.length === 0 && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Wallet className="w-5 h-5" />
              <span className="text-sm font-medium">{t('common.wallet')}</span>
            </button>
            
            {/* Credit */}
            <button
              onClick={() => {
                handlePaymentSelect('credit');
                setShowMorePayments(false);
              }}
              disabled={cart.length === 0}
              className={cn(
                'h-16 rounded-lg flex flex-col items-center justify-center gap-1 border-2 transition-all bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                selectedPayment === 'credit' && 'ring-2 ring-primary-foreground/60 ring-offset-2 ring-offset-background',
                activeSection === 'payments' && showMorePayments && sheetPaymentHighlightIndex === 6 && 'ring-2 ring-primary ring-offset-1 scale-[1.02]',
                cart.length === 0 && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Receipt className="w-5 h-5" />
              <span className="text-sm font-medium">{t('common.credit')}</span>
            </button>

            {/* Access Payment - counts in sales like cash */}
            <button
              onClick={() => {
                setShowMorePayments(false);
                setShowAccessPaymentDialog(true);
              }}
              className={cn(
                'h-16 rounded-lg flex flex-col items-center justify-center gap-1 border-2 transition-all bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                selectedPayment === 'access' && 'ring-2 ring-primary-foreground/60 ring-offset-2 ring-offset-background',
                activeSection === 'payments' && showMorePayments && sheetPaymentHighlightIndex === 7 && 'ring-2 ring-primary ring-offset-1 scale-[1.02]'
              )}
            >
              <Landmark className="w-5 h-5" />
              <span className="text-sm font-medium">Access Pay</span>
            </button>

            {/* Save as Quotation - only when module enabled */}
            {featureToggles.quotationEnabled && (
              <button
                onClick={handleSaveAsQuotation}
                disabled={cart.length === 0}
                className={cn(
                  'h-16 rounded-lg flex flex-col items-center justify-center gap-1 border-2 transition-all bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                  cart.length === 0 && 'opacity-50 cursor-not-allowed'
                )}
              >
                <FileSignature className="w-5 h-5" />
                <span className="text-sm font-medium">Save as Quote</span>
              </button>
            )}

            {/* Auto Payment Gateway */}
            {featureToggles.paymentGatewayEnabled && (
              <button
                onClick={() => { setShowMorePayments(false); setShowAutoPaymentDialog(true); }}
                disabled={cart.length === 0 || finalTotal <= 0}
                className={cn(
                  'h-16 rounded-lg flex flex-col items-center justify-center gap-1 border-2 transition-all bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                  (cart.length === 0 || finalTotal <= 0) && 'opacity-50 cursor-not-allowed'
                )}
              >
                <Landmark className="w-5 h-5" />
                <span className="text-sm font-medium">Auto Payment</span>
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Part Payment Dialog */}
      <PartPaymentDialog
        open={showPartPaymentDialog}
        onOpenChange={setShowPartPaymentDialog}
        totalAmount={Math.round(finalTotal)}
        onConfirm={(payments) => {
          setPartPaymentDetails(payments);
          handlePaymentSelect('part');
          toast({
            title: t('common.partPayment'),
            description: payments.map(p => `${p.method}: ${formatCurrency(p.amount)}`).join(', '),
          });
        }}
      />

      {/* Auto Payment via Gateway Hub */}
      <AutoPaymentDialog
        open={showAutoPaymentDialog}
        onOpenChange={setShowAutoPaymentDialog}
        amount={Math.round(finalTotal)}
        storeId={getActiveStore() || ''}
        onManualFallback={() => setShowAutoPaymentDialog(false)}
        onPaid={(info) => {
          setShowAutoPaymentDialog(false);
          toast({ title: 'Payment received', description: `Gateway: ${info.gatewayId}` });
          handlePaymentSelect('upi');
        }}
      />

      {/* Access Payment Dialog */}
      <AccessPaymentDialog
        open={showAccessPaymentDialog}
        onOpenChange={setShowAccessPaymentDialog}
        defaultAmount={cart.length > 0 ? finalTotal : 0}
        onConfirm={handleAccessPaymentConfirm}
      />

      {/* It's Paid Confirmation Dialog */}


      {/* Complimentary Dialog */}
      {showComplimentaryDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 animate-fade-in">
          <div className="bg-card rounded-2xl p-6 w-[90%] max-w-md shadow-2xl animate-scale-in">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Receipt className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-1">{t('common.complimentary')}</h3>
              <p className="text-sm text-muted-foreground">{t('common.enterReasonComplimentary')}</p>
            </div>
            
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">{t('common.reason')} *</label>
                <input
                  type="text"
                  value={complimentaryNote}
                  onChange={(e) => setComplimentaryNote(e.target.value)}
                  placeholder="e.g., VIP Guest, Birthday, Manager Approval"
                  className="w-full px-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:outline-none text-base"
                  autoFocus
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setShowComplimentaryDialog(false);
                  setComplimentaryNote('');
                }}
                className="py-3 rounded-xl bg-secondary text-foreground font-bold text-base hover:bg-muted transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  if (complimentaryNote.trim()) {
                    setIsComplimentary(true);
                    setShowComplimentaryDialog(false);
                    toast({ title: t('msg.complimentaryEnabled'), description: `${t('common.reason')}: ${complimentaryNote}` });
                  } else {
                    toast({ title: t('common.required'), description: t('common.enterReason'), variant: 'destructive' });
                  }
                }}
                className="py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold text-base transition-colors"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tax Settings Dialog */}
      {showTaxDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 animate-fade-in">
          <div className="bg-card rounded-2xl p-6 w-[90%] max-w-md shadow-2xl animate-scale-in">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Receipt className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-1">{t('settings.taxes')}</h3>
              <p className="text-sm text-muted-foreground">{t('msg.adjustTax') || 'Adjust tax percentage or set custom amount'}</p>
            </div>
            
            <div className="space-y-4 mb-6">
              {/* Tax Percentage Presets */}
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">{t('common.tax')} %</label>
                <div className="grid grid-cols-5 gap-2">
                  {[0, 5, 12, 18, 28].map((percent) => (
                    <button
                      key={percent}
                      onClick={() => {
                        setTaxPercent(percent);
                        setCustomTax(null);
                      }}
                      className={cn(
                        "py-2 rounded-lg text-sm font-medium transition-all border-2",
                        taxPercent === percent && customTax === null
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      {percent}%
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Custom Tax Amount */}
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">{t('msg.customTaxAmount') || 'Or Enter Custom Tax Amount'}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <input
                    type="number"
                    value={customTax !== null ? customTax : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setCustomTax(null);
                      } else {
                        setCustomTax(Number(val) || 0);
                      }
                    }}
                    placeholder={`Auto: ${formatCurrency(cartSubtotal * taxPercent / 100)}`}
                    className="w-full pl-8 pr-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:outline-none text-lg"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('msg.leaveEmptyForAuto') || `Leave empty to use ${taxPercent}% of subtotal`} ({formatCurrency(cartSubtotal * taxPercent / 100)})
                </p>
              </div>
              
              {/* No Tax Option */}
              <button
                onClick={() => {
                  setTaxPercent(0);
                  setCustomTax(0);
                }}
                className="w-full py-2 rounded-lg border-2 border-border text-sm font-medium hover:border-destructive hover:text-destructive transition-colors"
              >
                {t('msg.removeAllTax') || 'Remove All Tax'} ({formatCurrency(0)})
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowTaxDialog(false)}
                className="py-3 rounded-xl bg-secondary text-foreground font-bold text-base hover:bg-muted transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  setShowTaxDialog(false);
                  toast({ title: t('msg.taxUpdated'), description: `${t('msg.taxSetTo')} ${formatCurrency(calculatedTax)}` });
                }}
                className="py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base transition-colors"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

    {/* Link Barcode Dialog */}
    <LinkBarcodeDialog scannedCode={unmatchedCode} onClose={clearUnmatchedCode} />
    
    {/* QR Orders Sheet */}
    <Sheet open={showQROrders} onOpenChange={setShowQROrders}>
      <SheetContent side="right" className="w-[400px] sm:w-[450px]">
        <SheetHeader>
          <SheetTitle>QR Menu Orders</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <QROrdersPanel />
        </div>
      </SheetContent>
    </Sheet>
    {/* Sales Reset Warning Dialog */}
    <SalesResetWarningDialog
      isOpen={showSalesResetWarning}
      timeUntilReset={timeUntilReset}
      resetTimeLabel={formattedResetTime}
      onResetNow={handleResetNow}
      onExtend={handleExtendTime}
      onDismiss={dismissSalesResetWarning}
    />

    {/* Prompt Price & Weight Dialog */}
    <PromptPriceWeightDialog
      open={!!promptItem}
      onOpenChange={(open) => !open && setPromptItem(null)}
      item={promptItem}
      onAdd={(item, price, weight) => addToCart(item, price, weight)}
    />
    </>
  );
};

export default POSBillingPage;
