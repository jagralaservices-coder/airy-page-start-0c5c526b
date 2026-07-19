import React, { useState } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useLocale } from '@/contexts/LocaleContext';
import { getPaymentBreakdownSummary } from '@/lib/paymentBreakdown';
import { Banknote, CreditCard, Smartphone, DollarSign, QrCode, XCircle, TrendingUp, Calendar, Loader2, Printer } from 'lucide-react';
import { smartPrint } from '@/lib/printUtils';
import { toast } from 'sonner';

export const PaymentMethodsPage: React.FC = () => {
  const { formatCurrency } = useLocale();
  const { filteredOrders: allOrders, isLoading } = useAnalytics('all');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const selectedDateOrders = allOrders.filter(order => {
    const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
    return orderDate === selectedDate && order.status === 'completed';
  });

  const selectedDateCancelledOrders = allOrders.filter(order => {
    const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
    return orderDate === selectedDate && order.status === 'cancelled';
  });

  const totalSales = selectedDateOrders.reduce((sum, order) => sum + order.total, 0);
  const totalTax = selectedDateOrders.reduce((sum, order) => sum + order.tax, 0);
  const netSales = totalSales - totalTax;

  const paymentBreakdown = {
    cash: { amount: 0, count: 0 },
    card: { amount: 0, count: 0 },
    upi: { amount: 0, count: 0 },
    credit: { amount: 0, count: 0 },
    qr: { amount: 0, count: 0 },
    cancelled: { 
      amount: selectedDateCancelledOrders.reduce((sum, order) => sum + order.total, 0), 
      count: selectedDateCancelledOrders.length 
    },
  };

  selectedDateOrders.forEach(order => {
    const method = String(order.paymentMethod || '').toLowerCase().trim();
    if (method === 'qr') {
      paymentBreakdown.qr.amount += order.total;
      paymentBreakdown.qr.count += 1;
    } else {
      const breakdown = getPaymentBreakdownSummary(order);
      paymentBreakdown.cash.amount += breakdown.amounts.cash;
      paymentBreakdown.card.amount += breakdown.amounts.card;
      paymentBreakdown.upi.amount += breakdown.amounts.upi;
      paymentBreakdown.credit.amount += breakdown.amounts.credit;
      paymentBreakdown.cash.count += breakdown.counts.cash;
      paymentBreakdown.card.count += breakdown.counts.card;
      paymentBreakdown.upi.count += breakdown.counts.upi;
      paymentBreakdown.credit.count += breakdown.counts.credit;
    }
  });

  const handlePrint = () => {
    const storeDetails = JSON.parse(localStorage.getItem('pos_store_details') || '{}');
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Courier New', monospace; padding: 10px; max-width: 300px; margin: 0 auto; font-size: 11px; }
          .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; }
          .store-name { font-size: 16px; font-weight: bold; }
          .title { font-size: 14px; font-weight: bold; margin: 10px 0; text-align: center; background: #000; color: #fff; padding: 5px; }
          .date { text-align: center; margin-bottom: 15px; }
          .section { margin: 12px 0; padding: 8px 0; border-bottom: 1px dashed #000; }
          .section-title { font-weight: bold; margin-bottom: 8px; text-decoration: underline; }
          .row { display: flex; justify-content: space-between; margin: 4px 0; }
          .row-detail { display: flex; justify-content: space-between; margin: 3px 0; padding-left: 10px; font-size: 10px; }
          .total-row { font-weight: bold; font-size: 14px; border-top: 2px solid #000; padding-top: 10px; margin-top: 10px; }
          .footer { text-align: center; margin-top: 20px; font-size: 10px; }
          .highlight { background: #f0f0f0; padding: 5px; margin: 5px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="store-name">${storeDetails.name || 'MAXORA'}</div>
          ${storeDetails.address ? `<div>${storeDetails.address}</div>` : ''}
          ${storeDetails.phone ? `<div>Tel: ${storeDetails.phone}</div>` : ''}
        </div>
        
        <div class="title">PAYMENT METHODS REPORT</div>
        <div class="date">${new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        
        <div class="section">
          <div class="section-title">SALES SUMMARY</div>
          <div class="row"><span>Total Orders:</span><span>${selectedDateOrders.length}</span></div>
          <div class="row"><span>Gross Sales:</span><span>₹${totalSales.toFixed(2)}</span></div>
          <div class="row total-row"><span>NET SALES:</span><span>₹${netSales.toFixed(2)}</span></div>
        </div>
        
        <div class="section">
          <div class="section-title">PAYMENT METHODS</div>
          <div class="highlight">
            <div class="row"><span>💵 Cash Sales:</span><span>₹${paymentBreakdown.cash.amount.toFixed(2)}</span></div>
            <div class="row-detail"><span>(Qty: ${paymentBreakdown.cash.count})</span></div>
          </div>
          <div class="highlight">
            <div class="row"><span>💳 Card Sales:</span><span>₹${paymentBreakdown.card.amount.toFixed(2)}</span></div>
            <div class="row-detail"><span>(Qty: ${paymentBreakdown.card.count})</span></div>
          </div>
          <div class="highlight">
            <div class="row"><span>📱 UPI Sales:</span><span>₹${paymentBreakdown.upi.amount.toFixed(2)}</span></div>
            <div class="row-detail"><span>(Qty: ${paymentBreakdown.upi.count})</span></div>
          </div>
          <div class="highlight">
            <div class="row"><span>🌀 QR Orders:</span><span>₹${paymentBreakdown.qr.amount.toFixed(2)}</span></div>
            <div class="row-detail"><span>(Qty: ${paymentBreakdown.qr.count})</span></div>
          </div>
          <div class="highlight">
            <div class="row"><span>⏳ Credit Sales:</span><span>₹${paymentBreakdown.credit.amount.toFixed(2)}</span></div>
            <div class="row-detail"><span>(Qty: ${paymentBreakdown.credit.count})</span></div>
          </div>
          <div class="highlight" style="color: #dc2626;">
            <div class="row"><span>❌ Cancelled:</span><span>₹${paymentBreakdown.cancelled.amount.toFixed(2)}</span></div>
            <div class="row-detail"><span>(Qty: ${paymentBreakdown.cancelled.count})</span></div>
          </div>
        </div>
        
        <div class="footer">
          <div>━━━━━━━━━━━━━━━━━━━━━━</div>
          <div style="margin: 5px 0;">Report Generated: ${new Date().toLocaleString('en-IN')}</div>
          <div>Powered by MAXORA</div>
        </div>
      </body>
      </html>
    `;

    smartPrint(printContent, () => {
      toast.success('Report printed successfully');
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Payment Methods Report</h2>
            <p className="text-sm text-muted-foreground">Daily payment breakdown</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6 max-w-4xl mx-auto mt-4">
        <div className="flex items-center gap-3 bg-card p-4 rounded-xl border border-border">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="pos-input w-48"
          />
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-auto" />}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-success/10 border border-success/20 rounded-xl p-6">
            <p className="text-sm font-medium text-muted-foreground mb-1">Total Sales</p>
            <p className="text-3xl font-bold text-success">{formatCurrency(totalSales)}</p>
            <p className="text-sm text-muted-foreground mt-2">{selectedDateOrders.length} completed orders</p>
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-6">
            <p className="text-sm font-medium text-muted-foreground mb-1">Net Sales</p>
            <p className="text-3xl font-bold text-primary">{formatCurrency(netSales)}</p>
            <p className="text-sm text-muted-foreground mt-2">After tax deduction</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Payment Methods Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            <div className="bg-secondary rounded-lg p-4 text-center border border-border hover:border-success/30 transition-colors">
              <Banknote className="w-8 h-8 mx-auto mb-2 text-success" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cash</p>
              <p className="font-bold text-lg my-1">{formatCurrency(paymentBreakdown.cash.amount)}</p>
              <p className="text-xs text-muted-foreground bg-background py-1 rounded-md">{paymentBreakdown.cash.count} txns</p>
            </div>
            <div className="bg-secondary rounded-lg p-4 text-center border border-border hover:border-primary/30 transition-colors">
              <CreditCard className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Card</p>
              <p className="font-bold text-lg my-1">{formatCurrency(paymentBreakdown.card.amount)}</p>
              <p className="text-xs text-muted-foreground bg-background py-1 rounded-md">{paymentBreakdown.card.count} txns</p>
            </div>
            <div className="bg-secondary rounded-lg p-4 text-center border border-border hover:border-purple-500/30 transition-colors">
              <Smartphone className="w-8 h-8 mx-auto mb-2 text-purple-500" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">UPI</p>
              <p className="font-bold text-lg my-1">{formatCurrency(paymentBreakdown.upi.amount)}</p>
              <p className="text-xs text-muted-foreground bg-background py-1 rounded-md">{paymentBreakdown.upi.count} txns</p>
            </div>
            <div className="bg-secondary rounded-lg p-4 text-center border border-border hover:border-orange-500/30 transition-colors">
              <QrCode className="w-8 h-8 mx-auto mb-2 text-orange-500" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">QR Order</p>
              <p className="font-bold text-lg my-1">{formatCurrency(paymentBreakdown.qr.amount)}</p>
              <p className="text-xs text-muted-foreground bg-background py-1 rounded-md">{paymentBreakdown.qr.count} txns</p>
            </div>
            <div className="bg-secondary rounded-lg p-4 text-center border border-border hover:border-indigo-500/30 transition-colors">
              <DollarSign className="w-8 h-8 mx-auto mb-2 text-indigo-500" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Credit</p>
              <p className="font-bold text-lg my-1">{formatCurrency(paymentBreakdown.credit.amount)}</p>
              <p className="text-xs text-muted-foreground bg-background py-1 rounded-md">{paymentBreakdown.credit.count} txns</p>
            </div>
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 text-center">
              <XCircle className="w-8 h-8 mx-auto mb-2 text-destructive" />
              <p className="text-xs font-medium text-destructive uppercase tracking-wider">Cancelled</p>
              <p className="font-bold text-lg my-1 text-destructive">{formatCurrency(paymentBreakdown.cancelled.amount)}</p>
              <p className="text-xs text-destructive/80 bg-background py-1 rounded-md">{paymentBreakdown.cancelled.count} txns</p>
            </div>
          </div>
        </div>

        <button
          onClick={handlePrint}
          className="w-full sm:w-auto ml-auto pos-btn-primary py-3 px-6 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all"
        >
          <Printer className="w-5 h-5" />
          Print End of Day Report
        </button>
      </div>
    </div>
  );
};

export default PaymentMethodsPage;
