import { Icon } from "@/components/icon";
import { formatMyr } from "@/lib/finance/money";

const monthName = new Intl.DateTimeFormat("ms-MY", { month: "long", year: "numeric", timeZone: "UTC" });

function Amount({ value }: { value: string }) {
  const [currency, digits] = formatMyr(value).split(" ");
  return <strong className="metric-amount"><small>{currency}</small>{" "}{digits}</strong>;
}

export function Summary({ totals, period, level = 2 }: {
  totals: { income: string; expense: string; net: string; trend: { income: string; expense: string }[] };
  period: string;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  const previousMonth = totals.trend.at(-2);
  return <div className="summary-grid">
    <section className="net-panel">
      <time dateTime={period}>{monthName.format(new Date(`${period}-01T00:00:00Z`))}</time>
      <Heading>Pendapatan bersih direkod</Heading>
      <Amount value={totals.net} />
      <p>Pendapatan tolak perbelanjaan</p>
    </section>
    <div className="flow-totals">
      {(["income", "expense"] as const).map((key) => <section className={`flow-total flow-${key}`} key={key}>
        <span className="flow-symbol"><Icon name={key} size={21} /></span>
        <div className="flow-label"><Heading>{key === "income" ? "Pendapatan" : "Perbelanjaan"}</Heading>
          {previousMonth && <p>Bulan lalu <span>{formatMyr(previousMonth[key])}</span></p>}
        </div>
        <Amount value={totals[key]} />
      </section>)}
    </div>
  </div>;
}
