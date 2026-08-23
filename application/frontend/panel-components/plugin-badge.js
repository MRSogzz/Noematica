/* ============================================================
   PluginBadge — 通用的「插件介入指示器」（四層架構的 Component 層）
   ============================================================
   這是前端唯一認得 belief.plugin 這個欄位形狀的地方。不管後端裝的是
   Noematica-JSpace 還是以後任何實作了 runtime/plugins/latent_provider.py
   LatentProvider 介面的插件，只要它回傳的 plugin 物件符合這個形狀：

     { provider: string|null, intervened: boolean, activation_intervention: boolean }

   這個元件就能自動顯示，前端不需要為每一個新插件另外寫 UI、也不需要
   知道「J-space」這個名字——provider 欄位是後端插件自己填的字串，直接
   顯示，不寫死。這就是「前端插件擴充點」：擴充只發生在後端（多一個
   LatentProvider 實作、註冊進去），前端這一份 Component 完全不用改。

   沒有 belief.plugin，或 plugin.provider 是 null（沒裝任何插件）時，
   回傳空字串——跟 theme.json 的 panelSkins/fonts 同一套「有定義才長出來」
   原則，不會在沒裝插件的安裝上多出一條看不懂的 UI。
   ============================================================ */

function PluginBadge(plugin) {
  if (!plugin || !plugin.provider) return '';

  let label, color, desc;
  if (!plugin.intervened) {
    label = '已安裝，未介入'; color = 'rgba(255,255,255,0.35)';
    desc = `外掛「${plugin.provider}」這次判斷不需要介入（例如系統已棄權或信心不足）。`;
  } else if (plugin.activation_intervention) {
    label = '啟用中 · Latent 介入'; color = '#A97FE8';
    desc = `外掛「${plugin.provider}」這次直接介入了模型的內部 hidden state（非文字提示模擬）。`;
  } else {
    label = '啟用中 · 文字提示模擬'; color = '#fbbf24';
    desc = `外掛「${plugin.provider}」這次以文字提示模擬介入，不是真的 latent intervention（backend 不支援存取 hidden state，通常是因為接的是遠端文字 API）。`;
  }

  return `<div class="plugin-badge" title="${desc.replace(/"/g, '&quot;')}"
              style="display:inline-flex;align-items:center;gap:5px;font-size:10px;
                     padding:2px 8px;border-radius:10px;margin-bottom:6px;
                     border:1px solid ${color}55;color:${color};background:${color}14">
    <span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0"></span>
    ${plugin.provider} · ${label}
  </div>`;
}