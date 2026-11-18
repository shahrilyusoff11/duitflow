import { requirePageUser } from "@/lib/auth/session";
import { isTelegramConfigured } from "@/lib/config/telegram";
import { getTelegramSettings } from "@/lib/telegram/dal";
import { TelegramSettingsForm } from "@/components/telegram/settings-form";
import { AiSettingsForm } from "@/components/telegram/ai-settings-form";
import { getAiSettings } from "@/lib/ai/dal";
import { getAiConfig } from "@/lib/config/ai";

export const metadata = { title: "Tetapan — DuitFlow", referrer: "no-referrer" };

export default async function SettingsPage() {
  const user = await requirePageUser();
  const [connection, ai] = await Promise.all([getTelegramSettings(user.id), getAiSettings(user.id)]);
  const aiAvailable = getAiConfig(process.env) !== null;
  const configured = isTelegramConfigured(process.env);
  const linked = connection.telegramUserId !== null;
  return <>
    <p className="kicker">AKAUN DAN SAMBUNGAN</p><h1 className="account-title">Tetapan</h1>
    <section className="account-card" aria-label="Sambungan Telegram">
      <h2>Telegram</h2>
      <p>Status: <strong>{linked ? "Disambungkan" : "Belum disambungkan"}</strong></p>
      {linked && connection.linkedAt && <p>Dipautkan pada {new Intl.DateTimeFormat("ms-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }).format(new Date(connection.linkedAt))}.</p>}
      {!configured && <p>Telegram belum dikonfigurasi oleh pemilik aplikasi. Fungsi kewangan web kekal tersedia.</p>}
      <p>Pautkan akaun anda untuk menyemak rekod dan mencadangkan transaksi dalam chat peribadi bot.</p>
      <TelegramSettingsForm linked={linked} configured={configured} />
    </section>
    <section className="account-card" aria-label="Cara menggunakan Telegram">
      <h2>Catat dengan pengesahan anda</h2>
      <p>Hantar <code>Makan RM12</code> atau <code>Gaji RM2500</code>. Bot meminta butiran yang kurang dan memaparkan cadangan sebelum menyimpan.</p>
      <p>Tekan <strong>Sahkan</strong> untuk menyimpan atau <strong>Batal</strong> untuk membuang cadangan. Gunakan <code>/cancel</code> untuk membatalkan cadangan semasa.</p>
      <p><code>/balance</code> menunjukkan pendapatan tolak perbelanjaan direkodkan bulan ini, <code>/budget</code> menunjukkan bajet dan <code>/report</code> menunjukkan ringkasan rekod.</p>
      <p>Mesej dan balasan melalui Telegram. Gunakan chat peribadi sahaja dan jangan hantar maklumat bank atau rahsia. Peraturan tempatan sentiasa tersedia; penghuraian AI memerlukan persetujuan anda di bawah.</p>
    </section>
    <section className="account-card" aria-label="Privasi dan penghuraian AI">
      <h2>Penghuraian AI pilihan</h2>
      <p>Persetujuan anda: <strong>{ai.deepseekParsingEnabled ? "Dihidupkan" : "Dimatikan"}</strong>. AI {aiAvailable ? "tersedia" : "belum tersedia; peraturan tempatan digunakan"}.</p>
      <p>Apabila dihidupkan dan tersedia, DuitFlow menghantar mesej baharu daripada chat peribadi bot, tarikh tempatan hari ini dan nama kategori kepada DeepSeek Flash. Sejarah transaksi, nama profil, e-mel, ID dan token tidak disertakan.</p>
      <p>Gunakan contoh sintetik untuk percubaan ini. Elakkan maklumat sensitif, sulit atau peribadi dalam mesej dan nama kategori, termasuk butiran bank.</p>
      <p>AI boleh tersilap. Semak amaun, tarikh dan kategori; hanya butang Sahkan menyimpan transaksi. Jawapan kewangan dikira daripada rekod tersimpan. Jika AI gagal atau had dicapai, gunakan Makan RM12, Gaji RM2500, /balance, /budget atau /report.</p>
      <p>Mematikan AI menghentikan penghantaran seterusnya. Permintaan yang sudah dihantar tidak boleh ditarik balik.</p>
      <p><a className="text-link" href="https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html" target="_blank" rel="noopener noreferrer">Terma API DeepSeek</a></p>
      <AiSettingsForm enabled={ai.deepseekParsingEnabled} isDemo={ai.isDemo} />
    </section>
  </>;
}
