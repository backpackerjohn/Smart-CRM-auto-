import type { Customer, Deal, Vehicle } from "@/types/db";

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

export function ProfilePanel({ deal, primary, coBuyer, vehicle, trade }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <Section title="Primary customer">
        <Field label="Name" value={customerName(primary)} />
        <Field label="DL #" value={primary?.dl_number} />
        <Field label="DL state" value={primary?.dl_state} />
        <Field label="DOB" value={primary?.dob} />
        <Field label="Address" value={primary?.address_line1} />
        <Field label="City/State/Zip" value={
          primary ? [primary.city, primary.state, primary.zip].filter(Boolean).join(", ") : null
        } />
        <Field label="Phone" value={primary?.phone} />
        <Field label="Email" value={primary?.email} />
      </Section>

      {coBuyer && (
        <Section title="Co-buyer">
          <Field label="Name" value={customerName(coBuyer)} />
          <Field label="DL #" value={coBuyer.dl_number} />
          <Field label="DOB" value={coBuyer.dob} />
        </Section>
      )}

      <Section title="Vehicle of interest">
        <Field label="VIN" value={vehicle?.vin} />
        <Field label="Year / Make / Model" value={vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") : null} />
        <Field label="Stock #" value={vehicle?.stock_number} />
      </Section>

      {trade && (
        <Section title="Trade-in">
          <Field label="VIN" value={trade.vin} />
          <Field label="Year / Make / Model" value={[trade.year, trade.make, trade.model].filter(Boolean).join(" ")} />
          <Field label="Payoff (cents)" value={deal.trade_payoff_amount_cents} />
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
