import type { Customer, Deal, Vehicle } from "@/types/db";

// Flattens DB rows into the dot-path shape used by PDF mappings and the chat context.
// Currency stays in cents; the PDF fill layer handles the cents→dollars transform.

export interface FlatDeal {
  primary: FlatCustomer;
  coBuyer: FlatCustomer;
  vehicle: FlatVehicle;
  trade: FlatTrade;
  insurance: FlatInsurance;
  deal: { createdAt: string; title: string | null; stage: string };
}

interface FlatCustomer {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  dob: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  dlNumber: string | null;
  dlState: string | null;
  dlExpiration: string | null;
  ssnLast4: string | null;
  ssnFull: string | null;
  employer: string | null;
  employerPhone: string | null;
  occupation: string | null;
  monthlyIncomeCents: number | null;
  yearsAtAddress: number | null;
  yearsEmployed: number | null;
}

interface FlatVehicle {
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  color: string | null;
  mileage: number | null;
  stockNumber: string | null;
}

interface FlatTrade extends FlatVehicle {
  payoffAmountCents: number | null;
  payoffGoodThrough: string | null;
  payoffLender: string | null;
}

interface FlatInsurance {
  carrier: string | null;
  policy: string | null;
  effective: string | null;
  expires: string | null;
}

const EMPTY_CUSTOMER: FlatCustomer = {
  firstName: null, middleName: null, lastName: null, dob: null,
  addressLine1: null, addressLine2: null, city: null, state: null, zip: null,
  phone: null, email: null, dlNumber: null, dlState: null, dlExpiration: null,
  ssnLast4: null, ssnFull: null, employer: null, employerPhone: null, occupation: null,
  monthlyIncomeCents: null, yearsAtAddress: null, yearsEmployed: null,
};

const EMPTY_VEHICLE: FlatVehicle = {
  vin: null, year: null, make: null, model: null, trim: null, color: null, mileage: null, stockNumber: null,
};

function flatCustomer(c: Customer | null): FlatCustomer {
  if (!c) return { ...EMPTY_CUSTOMER };
  return {
    firstName: c.first_name, middleName: c.middle_name, lastName: c.last_name, dob: c.dob,
    addressLine1: c.address_line1, addressLine2: c.address_line2, city: c.city, state: c.state, zip: c.zip,
    phone: c.phone, email: c.email, dlNumber: c.dl_number, dlState: c.dl_state, dlExpiration: c.dl_expiration,
    ssnLast4: c.ssn_last4, ssnFull: c.ssn_full, employer: c.employer, employerPhone: c.employer_phone,
    occupation: c.occupation, monthlyIncomeCents: c.monthly_income_cents,
    yearsAtAddress: c.years_at_address, yearsEmployed: c.years_employed,
  };
}

function flatVehicle(v: Vehicle | null): FlatVehicle {
  if (!v) return { ...EMPTY_VEHICLE };
  return {
    vin: v.vin, year: v.year, make: v.make, model: v.model, trim: v.trim,
    color: v.color, mileage: v.mileage, stockNumber: v.stock_number,
  };
}

export interface FlattenInput {
  deal: Deal;
  primary: Customer | null;
  coBuyer: Customer | null;
  vehicle: Vehicle | null;
  trade: Vehicle | null;
}

export function flattenDeal(input: FlattenInput): FlatDeal {
  return {
    primary: flatCustomer(input.primary),
    coBuyer: flatCustomer(input.coBuyer),
    vehicle: flatVehicle(input.vehicle),
    trade: {
      ...flatVehicle(input.trade),
      payoffAmountCents: input.deal.trade_payoff_amount_cents,
      payoffGoodThrough: input.deal.trade_payoff_good_through,
      payoffLender: input.deal.trade_payoff_lender,
    },
    insurance: {
      carrier: input.deal.insurance_carrier,
      policy: input.deal.insurance_policy,
      effective: input.deal.insurance_effective,
      expires: input.deal.insurance_expires,
    },
    deal: {
      createdAt: input.deal.created_at,
      title: input.deal.title,
      stage: input.deal.stage,
    },
  };
}
