import React, { useState } from 'react';

export default function ApiSettings({ settings, api, busy, run, refresh }) {
    const [testing, setTesting] = useState(false), [testResult, setTestResult] = useState(null);
    const values = form => {
        const data = new FormData(form);
        return { ...Object.fromEntries(data), apiUses: data.getAll('apiUses') };
    };
    async function test(form) {
        setTesting(true); setTestResult(null);
        try { const result = await api('/settings/test', values(form)); setTestResult({ ok: true, text: result.message }); }
        catch (error) { setTestResult({ ok: false, text: error.message }); }
        finally { setTesting(false); }
    }
    return <form className="settings api-settings" onChange={() => setTestResult(null)} onSubmit={event => {
        event.preventDefault(); const input = values(event.currentTarget);
        run(async () => { await api('/settings', input, 'PUT'); await refresh(); });
    }}>
        <div><h2>翻译与 AI</h2><p>本地词典和内置在线翻译可直接使用。自定义 API 按下方用途启用。</p></div>
        <section className="panel">
            <fieldset><legend>自定义 API 用途</legend>{[['translation','阅读 / 划词翻译'],['grading','练习评分'],['media','影视预习精选']].map(([value,label]) => <label className="check-row" key={value}><input type="checkbox" name="apiUses" value={value} defaultChecked={settings.apiUses?.includes(value)}/>{label}</label>)}</fieldset>
            {[['apiBase','API 地址','https://api.openai.com/v1'],['apiKey','API Key','本地兼容服务可以留空'],['model','模型名称','填写服务提供的模型名称']].map(([name,label,placeholder]) => <label key={name}>{label}<input name={name} type={name==='apiKey'?'password':'text'} defaultValue={settings[name] || ''} placeholder={placeholder}/></label>)}
            <div className="actions"><button className="primary" disabled={busy || testing}>保存设置</button><button type="button" disabled={busy || testing} onClick={event => test(event.currentTarget.form)}>{testing ? '测试中…' : '测试连接'}</button></div>
            <p className="quiet">测试使用当前填写的配置，会发送一次简短请求，可能产生少量费用。</p>
            {testResult && <p role={testResult.ok?'status':'alert'} className={testResult.ok?'connection-success':'draft-error'}>{testResult.text}</p>}
            <details className="settings-help"><summary>使用说明</summary><p className="quiet">翻译依次尝试：启用用途的自定义 API → Bing → Yandex → 本地词典。在线翻译会发送所选文字；API 评分会发送题目与答案。影视预习会发送片名及部分字幕。DeepSeek 官方接口默认关闭思考模式，以减少 token 消耗。测试连接成功后，仍需保存设置。</p></details>
            <details className="settings-help"><summary>影视数据源</summary><label>苹果 CMS V10 地址（可选）<input name="mediaApi" defaultValue={settings.mediaApi || ''} placeholder="https://example.com/api.php/provide/vod/"/></label></details>
        </section>
    </form>;
}
