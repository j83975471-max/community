import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from "axios";
import FormData from "form-data";

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";

const getEnv = (key: string) => {
  return (process.env[key] || "").trim();
};

async function getTenantAccessToken() {
  const appId = getEnv("FEISHU_APP_ID");
  const appSecret = getEnv("FEISHU_APP_SECRET");
  
  if (!appId || !appSecret) {
    throw new Error("Missing FEISHU_APP_ID or FEISHU_APP_SECRET");
  }
  
  const url = `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`;
  const response = await axios.post(url, {
    app_id: appId,
    app_secret: appSecret,
  });
  
  return response.data.tenant_access_token;
}

async function uploadToFeishuBitable(base64Data: string, filename: string, accessToken: string, tokenToUse: string) {
  const base64Content = base64Data.split(",")[1] || base64Data;
  const buffer = Buffer.from(base64Content, 'base64');

  const url = `${FEISHU_API_BASE}/drive/v1/files/upload_all`;
  const form = new FormData();
  form.append('file_name', filename);
  form.append('parent_type', 'bitable');
  form.append('parent_node', tokenToUse);
  form.append('size', String(buffer.length));
  form.append('file', buffer, { 
    filename: filename,
    contentType: 'image/png' 
  });

  const response = await axios.post(url, form, {
    headers: {
      ...form.getHeaders(),
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (response.data.code !== 0) {
    throw new Error(`Feishu Upload Error: ${response.data.msg}`);
  }
  return response.data.data.file_token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { onionId, images, timestamp } = req.body;
    let appToken = getEnv("FEISHU_BITABLE_APP_TOKEN");
    const tableId = getEnv("FEISHU_BITABLE_TABLE_ID");

    if (!appToken || !tableId) {
      return res.status(500).json({ error: "Server Configuration Missing" });
    }

    const accessToken = await getTenantAccessToken();
    appToken = appToken.replace(/[^a-zA-Z0-9]/g, '');

    // 1. Resolve Token (Wiki to Bitable)
    let finalAppToken = appToken;
    try {
      const appUrl = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}`;
      const appRes = await axios.get(appUrl, { headers: { "Authorization": `Bearer ${accessToken}` } });
      finalAppToken = appRes.data.data?.app?.app_token || appToken;
    } catch (err) {
      try {
        const wikiUrl = `${FEISHU_API_BASE}/wiki/v2/nodes/${appToken}`;
        const wikiRes = await axios.get(wikiUrl, { headers: { "Authorization": `Bearer ${accessToken}` } });
        finalAppToken = wikiRes.data.data?.node?.obj_token || appToken;
      } catch (e) {}
    }

    // 2. Upload Images
    const fileTokens = [];
    if (images && Array.isArray(images)) {
      for (let i = 0; i < images.length; i++) {
        try {
          const token = await uploadToFeishuBitable(images[i], `sc_${onionId}_${i+1}.png`, accessToken, finalAppToken);
          fileTokens.push({ file_token: token });
        } catch (e) {
          console.error("Image upload failed", e);
        }
      }
    }

    // 3. Create Record
    const recordUrl = `${FEISHU_API_BASE}/bitable/v1/apps/${finalAppToken}/tables/${tableId}/records`;
    const recordData = {
      fields: {
        "洋葱ID": onionId,
        "提交时间": timestamp,
        "分享截图": fileTokens,
      }
    };

    await axios.post(recordUrl, recordData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Vercel Function Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
