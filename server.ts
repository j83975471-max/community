import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";

import FormData from "form-data";

dotenv.config();

const app = express();
const PORT = 3000;
const UPLOADS_DIR = "/tmp/onion_uploads";

// 增加 body 限制以支持多张图片上传
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// 确保临时目录存在
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 托管静态图片资源
app.use("/view-image", express.static(UPLOADS_DIR));

// 获取并处理环境变量（自动去空格，防止 404）
const getEnv = (key: string) => {
  const value = (process.env[key] || "").trim();
  return value;
};

// 预检变量情况
function checkEnv() {
  const vars = ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_BITABLE_APP_TOKEN", "FEISHU_BITABLE_TABLE_ID"];
  console.log("=== [系统自检] 飞书变量加载状态 ===");
  vars.forEach(v => {
    const val = getEnv(v);
    if (!val) {
      console.warn(`❌ 缺失变量: ${v}`);
    } else {
      console.log(`✅ 已加载: ${v} (${val.substring(0, 3)}***${val.substring(val.length - 3)})`);
    }
  });
  console.log("==================================");
}

// 解析 JSON 体
app.use(express.json({ limit: '20mb' }));

/**
 * 飞书 API 服务
 */
const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";

// 获取通行证
async function getTenantAccessToken() {
  const appId = getEnv("FEISHU_APP_ID");
  const appSecret = getEnv("FEISHU_APP_SECRET");
  
  if (!appId || !appSecret) {
    throw new Error("请在设置中检查 FEISHU_APP_ID 和 FEISHU_APP_SECRET");
  }
  
  const url = `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`;
  const response = await axios.post(url, {
    app_id: appId,
    app_secret: appSecret,
  });
  
  return response.data.tenant_access_token;
}

// 核心功能：上传附件
async function uploadToFeishuBitable(base64Data: string, filename: string, accessToken: string, appToken: string, originalToken?: string) {
  if (!appToken) throw new Error("无法上传：缺失 FEISHU_BITABLE_APP_TOKEN");

  const base64Content = base64Data.split(",")[1] || base64Data;
  const buffer = Buffer.from(base64Content, 'base64');

  async function performUpload(tokenToUse: string) {
    const url = `${FEISHU_API_BASE}/drive/v1/files/upload_all`;
    console.log(`[Feishu API] 正在采用飞书 Agent 方案 (Drive API) 上传附件...`);

    const form = new FormData();
    form.append('file_name', filename);
    form.append('parent_type', 'bitable');
    form.append('parent_node', tokenToUse);
    form.append('size', String(buffer.length)); // 飞书要求 size 为 string 或 int，这里转一下
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
      throw new Error(`Drive API 上传失败: ${response.data.msg}`);
    }

    return response.data;
  }

  try {
    let result = await performUpload(appToken);

    // 如果 404 且有原始 Token，触发自动纠偏重试
    if (result.code === 1254006 || result.code === 10006) { // 飞书特有的资源不存在代码
       if (originalToken && originalToken !== appToken) {
         console.warn(`[Feishu API] 主 Token 上传 404，尝试使用原始 Token 重试...`);
         result = await performUpload(originalToken);
       }
    }

    if (result.code !== 0) {
      console.error("[飞书上传响应失败]", result);
      throw new Error(`飞书 API 报错(${result.code}): ${result.msg}`);
    }

    console.log(`[Feishu API] 图片上传成功: ${result.data.file_token}`);
    return result.data.file_token;
  } catch (err: any) {
    // 处理异常情况下的重试 (针对真正的 HTTP 404)
    if (err.response?.status === 404 && originalToken && originalToken !== appToken) {
       try {
         console.warn(`[Feishu API] HTTP 404，正在执行终极重试逻辑...`);
         const retryResult = await performUpload(originalToken);
         if (retryResult.code === 0) {
            return retryResult.data.file_token;
         }
       } catch (retryErr) {
         console.error("[Feishu API] 终极重试也失败了");
       }
    }

    const resp = err.response;
    if (resp) {
      const errorData = resp.data;
      if (resp.status === 404) {
        throw new Error(`飞书 404 故障！即便尝试了多种 ID 映射依然无法找到该附件接口。请检查该多维表格是否属于知识库，且应用是否已获得足够的读写权限。`);
      }
      const msg = errorData?.msg || "未知上传错误";
      throw new Error(`飞书上传失败(${resp.status}): ${msg}`);
    }
    throw err;
  }
}

// 获取真实的 Bitable App Token (如果填的是 Wiki Token 则转换)
async function getRealAppToken(token: string, accessToken: string) {
  // 如果是标准的 Wiki ID (通常以 GZc 开头) 才进行转换
  // 如果是用户从 API 调试台拿到的 ID (如 VGB...)，则直接使用
  if (!token.startsWith('GZc')) {
    return token;
  }

  console.log(`[Wiki Helper] 监测到 Wiki ID: ${token}，正在自动转换为 Bitable Token...`);
  try {
    const url = `${FEISHU_API_BASE}/wiki/v2/nodes/${token}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.data.code === 0 && response.data.data.node.obj_type === 'bitable') {
      const realToken = response.data.data.node.obj_token;
      console.log(`[Wiki Helper] 转换成功！真实 Token 为: ${realToken.substring(0, 5)}***`);
      return realToken;
    } else {
      throw new Error(`转换失败: 节点类型不是 bitable 或权限不足 (${response.data.msg})`);
    }
  } catch (error: any) {
    console.error("[Wiki Helper Error]", error.response?.data || error.message);
    throw new Error(`无法识别该 Wiki ID，请确保已开通“查看知识库内容”权限并发布应用。详情: ${error.message}`);
  }
}

/**
 * API: 提交数据到飞书
 */
app.post("/api/submit-to-feishu", async (req, res) => {
  const isDebug = getEnv("DEBUG") === "true";
  
  try {
    const { onionId, images, timestamp } = req.body;
    let appToken = getEnv("FEISHU_BITABLE_APP_TOKEN");
    const tableId = getEnv("FEISHU_BITABLE_TABLE_ID");

    // 修复：使用 x-forwarded-host 或 host 识别真实的外网地址，而不是 localhost
    const publicHost = req.headers['x-forwarded-host'] || req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https'; // 优先推断 https
    const baseUrl = `${protocol}://${publicHost}`;
    
    console.log(`[Diagnostic] 生成外网图片基础路径: ${baseUrl}`);

    if (!appToken || !tableId) {
      return res.status(500).json({ error: "配置缺失：请检查 Token 或 Table ID" });
    }

    const accessToken = await getTenantAccessToken();

    // 纠错：确保 appToken 被清理
    appToken = appToken.replace(/[^a-zA-Z0-9]/g, '');
    let originalToken = appToken;
    let finalAppToken = appToken;
    let bitableName = "未知多维表格";

    async function tryResolveToken(token: string) {
      console.log(`[Diagnostic] 正在尝试访问 Token: ${token.substring(0, 8)}...`);
      try {
        const appUrl = `${FEISHU_API_BASE}/bitable/v1/apps/${token}`;
        const appRes = await axios.get(appUrl, { headers: { "Authorization": `Bearer ${accessToken}` } });
        // 关键点：从返回结果中提取最真实、最底层的 app_token (通常是以 bas 开头的)
        const realToken = appRes.data.data?.app?.app_token || token;
        return { success: true, name: appRes.data.data?.app?.name, realToken };
      } catch (err: any) {
        return { success: false, status: err.response?.status, data: err.response?.data };
      }
    }

    // 第一阶段：直接尝试原始 Token
    let result = await tryResolveToken(finalAppToken);
    
    // 如果返回的 realToken 和我们传进去的不一样 (说明发生了 Wiki 到 Bitable 的自动映射)
    if (result.success && result.realToken && result.realToken !== finalAppToken) {
      console.log(`[Diagnostic] 发现 ID 映射: ${finalAppToken.substring(0, 5)}... -> ${result.realToken.substring(0, 5)}...`);
      finalAppToken = result.realToken;
    }

    // 第二阶段：如果是 404 且不是标准 bas 开头，尝试作为 Wiki Token 转换
    if (!result.success && !finalAppToken.startsWith('bas') && !finalAppToken.startsWith('app')) {
      console.log("[Diagnostic] 原始访问 404，尝试作为 Wiki Token 转换...");
      try {
        const wikiUrl = `${FEISHU_API_BASE}/wiki/v2/nodes/${originalToken}`;
        const wikiRes = await axios.get(wikiUrl, { headers: { "Authorization": `Bearer ${accessToken}` } });
        if (wikiRes.data.data?.node?.obj_token) {
          finalAppToken = wikiRes.data.data.node.obj_token;
          console.log(`[Wiki Helper] 转换成功，真实 Token 为: ${finalAppToken.substring(0, 8)}...`);
          result = await tryResolveToken(finalAppToken);
        }
      } catch (e) {
        console.log("[Wiki Helper] 转换尝试也失败了。");
      }
    }

    // 第三阶段：如果依然失败，启动“权限盲查”模式，看看机器人到底能看见啥
    if (!result.success) {
      console.error(`[Fatal] 无法访问多维表格。状态: ${result.status}`);
      try {
        const listUrl = `${FEISHU_API_BASE}/bitable/v1/apps?page_size=20`;
        const listRes = await axios.get(listUrl, { headers: { "Authorization": `Bearer ${accessToken}` } });
        const accessibleApps = listRes.data.data?.items || [];
        const appNames = accessibleApps.map((a: any) => `“${a.name}”(${a.app_token.substring(0, 5)}...)`).join(", ");
        
        if (accessibleApps.length === 0) {
          throw new Error(`权限空洞！您的机器人目前【看不见任何多维表格】。请确认：您是在【多维表格】页面的【分享/协作】里通过搜索名字添加的机器人，而不是只在 Wiki 首页加了。`);
        } else {
          throw new Error(`Token 匹配失败！您的机器人目前有权访问：${appNames}。但无法识别您填写的 ID (${originalToken.substring(0, 5)}...)。请从它的【可访问列表】里挑选正确的 ID 填入。`);
        }
      } catch (listErr: any) {
        if (listErr.message.includes("权限空洞") || listErr.message.includes("Token 匹配失败")) throw listErr;
        throw new Error(`飞书 404 故障：不仅找不到此 ID，连列表权限也被封锁了。请核对 App ID/Secret 是否对应。`);
      }
    }

    bitableName = result.name || "已连接的表格";
    console.log(`✅ 成功连接！目标表格: ${bitableName}`);
    appToken = finalAppToken; // 使用验证通过的 Token

    // --- 自动容错：尝试验证 Table ID ---
    let finalTableId = tableId;
    try {
      const checkUrl = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}`;
      await axios.get(checkUrl, { headers: { "Authorization": `Bearer ${accessToken}` } });
    } catch (e: any) {
      if (e.response?.status === 404) {
        console.warn(`[Table Helper] 预设的 Table ID (${tableId}) 似乎无效，正在尝试自动寻找可用表格...`);
        try {
          const listUrl = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables`;
          const listRes = await axios.get(listUrl, { headers: { "Authorization": `Bearer ${accessToken}` } });
          const tables = listRes.data.data.items;
          if (tables && tables.length > 0) {
            finalTableId = tables[0].table_id;
            console.log(`[Table Helper] 自动纠偏成功！将使用第一个表格: ${tables[0].name} (${finalTableId})`);
          } else {
            throw new Error("该多维表格内没有任何数据表，请先在飞书里创建一个页签");
          }
        } catch (listErr) {
          console.error("[Table Helper] 无法列出表格，可能权限确实不足");
          throw e; // 抛出原始 404
        }
      } else {
        throw e;
      }
    }

    // --- 关键修复：Token 搞定后，再开始处理图片 ---
    
    // 1. 转换图片为本地 URL 模式
    const hostedUrls: string[] = [];
    const fileTokens: any[] = [];
    let imageErrorLog = "";
    
    if (images && Array.isArray(images)) {
      for (let i = 0; i < images.length; i++) {
        try {
          const base64Data = images[i].split(",")[1] || images[i];
          const filename = `${crypto.randomUUID()}_${i}.png`;
          const filePath = path.join(UPLOADS_DIR, filename);
          
          fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
          const publicUrl = `${baseUrl}/view-image/${filename}`;
          hostedUrls.push(publicUrl);
        } catch (saveErr) {
          console.error("[图片本地保存失败]", saveErr);
        }
      }
    }

    // 2. 依然尝试上传飞书原图库 (作为备选)，如果失败了，我们有 URL 兜底
    if (images && Array.isArray(images)) {
      for (let i = 0; i < images.length; i++) {
        try {
          // 传递 originalToken 用于 404 时的重试
          const token = await uploadToFeishuBitable(images[i], `sc_${onionId}_${i+1}.png`, accessToken, appToken, originalToken);
          fileTokens.push({ file_token: token });
        } catch (uploadErr: any) {
          imageErrorLog = uploadErr.message || "未知上传错误";
          console.error(`[上传跳过] 图片 ${i+1} 失败，将仅通过 URL 呈现: ${imageErrorLog}`);
        }
      }
    }

    // 2. 写入记录
    const url = `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${finalTableId}/records`;
    if (isDebug) console.log(`[Feishu API] 正在写入数据: ${url.replace(appToken, '***').replace(tableId, '***')}`);

    const urlList = hostedUrls.join("\n");
    const recordData = {
      fields: {
        "洋葱ID": onionId,
        "提交时间": timestamp,
        "分享截图": fileTokens,
        "详情备注": imageErrorLog ? 
          `⚠️ 飞书截图上传失败，请点此查看/下载原图: \n${urlList}\n\n错误详情: ${imageErrorLog}` : 
          `✅ 飞书同步成功，备份链接: \n${urlList}`
      }
    };

    const response = await axios.post(url, recordData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.data.code && response.data.code !== 0) {
      throw new Error(`飞书写入失败(${response.data.code}): ${response.data.msg}`);
    }

    res.json({ success: true });
  } catch (error: any) {
    const errorBody = error.response?.data;
    const errorStatus = error.response?.status;
    
    console.error("--- [飞书同步异常报告] ---");
    console.error(`状态码: ${errorStatus}`);
    console.error(`详细内容: ${JSON.stringify(errorBody || error.message)}`);
    console.error("--------------------------");

    // 格式化友好的错误提示
    let friendlyTips = "飞书同步异常";
    if (errorStatus === 404) {
      friendlyTips = "飞书找不到该表格 (404)。请确认 ID 正确，或参考开发者说明将其转换为 bas 开头的真实 ID。";
    } else if (errorStatus === 403) {
      friendlyTips = "飞书权限不足 (403)。请检查：1.应用是否添加了权限？2.应用是否已发布版本？3.是否在知识库中添加了该应用为协作者？";
    }

    res.status(500).json({ 
      error: friendlyTips, 
      details: errorBody || error.message,
      debugInfo: {
        status: errorStatus,
        url: error.config?.url?.replace(getEnv("FEISHU_BITABLE_APP_TOKEN"), "***")
      }
    });
  }
});

async function startServer() {
  checkEnv(); // 启动自检
  // Vite 模式集成
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`[Mode] ${process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}`);
  });
}

startServer();
