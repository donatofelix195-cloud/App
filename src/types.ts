export interface Transaction {
  id: number;
  date: string; // format "DD/MM/YYYY"
  desc: string;
  amt: number;
  type: 'in' | 'out'; // in = ingreso, out = gasto
  curr: 'USD' | 'BS';
  cat: string;
  wallet?: 'main' | 'ticket'; // main = Cuenta Principal, ticket = Ticket de Alimentación
  bank?: string; // Nombre del banco (BDV, Mercantil, Banesco, Provincial, etc.)
  method?: string; // Método de pago (Pago Móvil, Transferencia)
  commission?: number; // Comisión calculada (en la moneda de la transacción)
}

export interface Rates {
  usd: number; // BCV Dólar
  eur: number; // BCV Euro
  bin: number; // Binance USDT
  par: number; // Paralelo
}

export type CurrencyMode = 'USD' | 'BS';
export type RateKey = 'usd' | 'eur' | 'bin' | 'par';
