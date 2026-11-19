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
    <header className="workspace-heading"><h1 className="account-title">Tetapan</h1></header>
    <div className="settings-layout">
      <section className="account-card" aria-label="Sambungan Telegram">
        <h2>Telegram</h2>
        <p>Status: <strong>{linked ? "Disambungkan" : "Belum disambungkan"}</strong></p>
        {linked && connection.linkedAt && <p>Dipautkan pada {new Intl.DateTimeFormat("ms-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }).format(new Date(connection.linkedAt))}.</p>}
        {!configured && <p>Telegram belum dikonfigurasi oleh pemilik aplikasi. Fungsi kewangan web kekal tersedia.</p>}
        <p>Pautkan akaun anda untuk menyemak rekod dan mencadangkan transaksi dalam chat peribadi bot.</p>
        <TelegramSettingsForm linked={linked} configured={configured} />
        <details className="settings-guide">
          <summary>Cara menggunakan Telegram</summary>
          <p>Hantar <code>Makan RM12</code> atau <code>Gaji RM2500</code>. Bot meminta butiran yang kurang dan memaparkan cadangan sebelum menyimpan.</p>
          <p>Tekan <strong>Sahkan</strong> untuk menyimpan atau <strong>Batal</strong> untuk membuang cadangan. Gunakan <code>/cancel</code> untuk membatalkan cadangan semasa.</p>
          <p><code>/balance</code> menunjukkan pendapatan tolak perbelanjaan direkodkan bulan ini, <code>/budget</code> menunjukkan bajet dan <code>/report</code> menunjukkan ringkasan rekod.</p>
          <p>Mesej dan balasan melalui Telegram. Gunakan chat peribadi sahaja dan jangan hantar maklumat bank atau rahsia. Peraturan tempatan sentiasa tersedia; penghuraian AI memerlukan persetujuan anda di bawah.</p>
        </details>
      </section>
      <section className="account-card" aria-labelledby="profile-heading">
        <h2 id="profile-heading">Maklumat akaun</h2>
        <dl className="settings-profile">
          <div><dt>Nama</dt><dd>{user.name}</dd></div>
          <div><dt>E-mel</dt><dd>{user.email}</dd></div>
        </dl>
      </section>
      <section className="account-card ai-settings" aria-label="Privasi dan penghuraian AI">
        <h2>Tafsiran mesej Telegram oleh DeepSeek</h2>
        <p>Persetujuan anda: <strong>{ai.deepseekChatEnabled ? "Dihidupkan" : "Dimatikan"}</strong>. AI {aiAvailable ? "tersedia" : "belum tersedia; peraturan tempatan digunakan"}.</p>
        <p>Jika peraturan tempatan kurang pasti dan anda bersetuju, DeepSeek Flash menerima susunan perkataan BM dan Inggeris yang dikenali dalam mesej semasa serta senarai kategori umum. Amaun, tarikh, nama kategori tersuai dan bahagian lain diganti dengan penanda. Mesej dengan corak rahsia atau maklumat bank diproses secara tempatan.</p>
        <p>DuitFlow memadankan penanda dan menyimpan identiti akaun, konteks chat, rekod kewangan serta hasil carian. Persetujuan ini dimatikan secara lalai, termasuk untuk pengguna yang pernah menghidupkan cadangan kategori DeepSeek.</p>
        <p>DeepSeek menggunakan cache untuk permintaan API. Mesej dan balasan juga disimpan dalam chat awan Telegram. Elakkan maklumat sensitif, termasuk butiran bank.</p>
        <p>AI memilih fungsi yang sepadan dengan mesej anda. DuitFlow mengira jawapan daripada rekod anda dan menunjukkan butiran cadangan sebelum anda tekan Sahkan. Jika AI gagal atau had dicapai, fungsi tempatan seperti Makan RM12, /bills, /balance, /budget dan /report masih tersedia.</p>
        <p>Mematikan AI menghentikan penghantaran seterusnya. Permintaan yang sudah dihantar tidak boleh ditarik balik.</p>
        <p><a className="text-link" href="https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html" target="_blank" rel="noopener noreferrer">Terma API DeepSeek</a> · <a className="text-link" href="https://api-docs.deepseek.com/guides/kv_cache/" target="_blank" rel="noopener noreferrer">Cache API DeepSeek</a></p>
        <AiSettingsForm enabled={ai.deepseekChatEnabled} isDemo={ai.isDemo} />
      </section>
    </div>
  </>;
}
