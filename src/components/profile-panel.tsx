import type { Customer, Deal, Vehicle } from "@/types/db";
import { ConfirmableField } from "./confirmable-field";
import { isValidVin, normalizeVin } from "@/lib/validation/vin";
import { isValidOhioDl } from "@/lib/validation/ohio-dl";

interface Props {
  deal: Deal;
  primary: Customer | null;
  coBuyer: Customer | null;
  vehicle: Vehicle | null;
  trade: Vehicle | null;
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-200">{value || <span className="text-zinc-600">—</span>}</span>
    </div>
  );
}

function customerName(c: Customer | null): string | null {
  if (!c) return null;
  return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ") || null;
}

function dlWarning(c: Customer | null): string | null {
  if (!c?.dl_number) return null;
  if (c.dl_state && c.dl_state.toUpperCase() === "OH" && !isValidOhioDl(c.dl_number)) {
    return "Does not match Ohio format — verify.";
  }
  return null;
}

function vinWarning(v: Vehicle | null): string | null {
  if (!v?.vin) return null;
  return isValidVin(normalizeVin(v.vin)) ? null : "VIN failed checksum — verify.";
}

export function ProfilePanel({ deal, primary, coBuyer, vehicle, trade }: Props) {
  const c = (deal.confirmed_fields ?? {}) as Record<string, boolean>;

  return (
    <div className="flex flex-col gap-3">
      <Section title="Primary customer">
        <Field label="Name" value={customerName(primary)} />
        <ConfirmableField
          dealId={deal.id}
          fieldPath="primary.dl_number"
          label="DL #"
          value={primary?.dl_number}
          initialConfirmed={!!c["primary.dl_number"]}
          warning={dlWarning(primary)}
        />
        <Field label="DL state" value={primary?.dl_state} />
        <ConfirmableField
          dealId={deal.id}
          fieldPath="primary.dob"
          label="DOB"
          value={primary?.dob}
          initialConfirmed={!!c["primary.dob"]}
        />
        <Field label="Address" value={primary?.address_line1} />
        <Field label="City/State/Zip" value={
          primary ? [primary.city, primary.state, primary.zip].filter(Boolean).join(", ") : null
        } />
        <Field label="Phone" value={primary?.phone} />
        <Field label="Email" value={primary?.email} />
        {primary?.ssn_full && (
          <ConfirmableField
            dealId={deal.id}
            fieldPath="primary.ssn_full"
            label="SSN"
            value={`XXX-XX-${primary.ssn_full.slice(-4)}`}
            initialConfirmed={!!c["primary.ssn_full"]}
          />
        )}
      </Section>

      {coBuyer && (
        <Section title="Co-buyer">
          <Field label="Name" value={customerName(coBuyer)} />
          <ConfirmableField
            dealId={deal.id}
            fieldPath="co_buyer.dl_number"
            label="DL #"
            value={coBuyer.dl_number}
            initialConfirmed={!!c["co_buyer.dl_number"]}
            warning={dlWarning(coBuyer)}
          />
          <ConfirmableField
            dealId={deal.id}
            fieldPath="co_buyer.dob"
            label="DOB"
            value={coBuyer.dob}
            initialConfirmed={!!c["co_buyer.dob"]}
          />
          {coBuyer.ssn_full && (
            <ConfirmableField
              dealId={deal.id}
              fieldPath="co_buyer.ssn_full"
              label="SSN"
              value={`XXX-XX-${coBuyer.ssn_full.slice(-4)}`}
              initialConfirmed={!!c["co_buyer.ssn_full"]}
            />
          )}
        </Section>
      )}

      <Section title="Vehicle of interest">
        <ConfirmableField
          dealId={deal.id}
          fieldPath="vehicle.vin"
          label="VIN"
          value={vehicle?.vin}
          initialConfirmed={!!c["vehicle.vin"]}
          warning={vinWarning(vehicle)}
        />
        <Field label="Year / Make / Model" value={vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") : null} />
        <Field label="Stock #" value={vehicle?.stock_number} />
      </Section>

      {trade && (
        <Section title="Trade-in">
          <ConfirmableField
            dealId={deal.id}
            fieldPath="trade.vin"
            label="VIN"
            value={trade.vin}
            initialConfirmed={!!c["trade.vin"]}
            warning={vinWarning(trade)}
          />
          <Field label="Year / Make / Model" value={[trade.year, trade.make, trade.model].filter(Boolean).join(" ")} />
          <ConfirmableField
            dealId={deal.id}
            fieldPath="deal.trade_payoff_amount_cents"
            label="Payoff"
            value={deal.trade_payoff_amount_cents !== null
              ? `$${(deal.trade_payoff_amount_cents / 100).toFixed(2)}`
              : null}
            initialConfirmed={!!c["deal.trade_payoff_amount_cents"]}
          />
          <Field label="Good through" value={deal.trade_payoff_good_through} />
          <Field label="Lender" value={deal.trade_payoff_lender} />
        </Section>
      )}

      <Section title="Insurance">
        <Field label="Carrier" value={deal.insurance_carrier} />
        <Field label="Policy #" value={deal.insurance_policy} />
        <Field label="Effective" value={deal.insurance_effective} />
        <Field label="Expires" value={deal.insurance_expires} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-surface-2 bg-surface-1 p-4">
      <h3 className="pb-2 text-sm font-semibold">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}
