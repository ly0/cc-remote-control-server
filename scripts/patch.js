#!/usr/bin/env node
// patch.js — 统一 patch 脚本
// 合并 patch.sh (7 步 sed 替换) 和 patch-cli-set-mode.js (3 个 AST 级插入)
// 共 10 步 patch，带交互式确认、幂等检查、失败回滚
//
// 用法:
//   node scripts/patch.js                          # 自动检测 CLI 路径，默认 server
//   node scripts/patch.js /path/to/cli.js          # 指定 CLI 路径
//   node scripts/patch.js /path/to/cli.js http://192.168.1.100:3000
//   node scripts/patch.js --force                   # 强制重新 patch (从 .bak 恢复)

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const readline = require("readline");

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------
const args = process.argv.slice(2).filter((a) => a !== "--force");
const forceFlag = process.argv.includes("--force");

let argCliPath = null;
let argServerUrl = null;

for (const a of args) {
  if (a.startsWith("http://") || a.startsWith("https://")) {
    argServerUrl = a;
  } else if (!argCliPath) {
    argCliPath = a;
  } else if (!argServerUrl) {
    argServerUrl = a;
  }
}

const DEFAULT_SERVER_URL = "http://127.0.0.1:3000";

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------
function detectCliPath() {
  try {
    const which = execSync("which claude", { encoding: "utf8" }).trim();
    try {
      return execSync(`readlink -f "${which}"`, { encoding: "utf8" }).trim();
    } catch {}
    try {
      return execSync(`realpath "${which}"`, { encoding: "utf8" }).trim();
    } catch {}
    return which;
  } catch {
    return null;
  }
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function replaceAndCount(src, pattern, replacement) {
  let count = 0;
  const result = src.replace(pattern, (...args) => {
    count++;
    return typeof replacement === "function" ? replacement(...args) : replacement;
  });
  return { result, count };
}

function patchStep(name, src, pattern, replacement, { min = 1, max = Infinity, condition = true } = {}) {
  if (!condition) {
    console.log(`  跳过: ${name} (条件不满足)`);
    return src;
  }
  const { result, count } = replaceAndCount(src, pattern, replacement);
  if (count < min || count > max) {
    throw new Error(
      `${name}: 预期替换 ${min === max ? min : `${min}-${max}`} 次，实际 ${count} 次`
    );
  }
  if (count === 0) {
    console.log(`  ⚠ ${name}: 无需替换（已为目标状态）`);
  } else {
    console.log(`  ✓ ${name}: 替换 ${count} 次`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let absPath = null;

  try {
    // --- 1. 确定 CLI 路径 ---
    let cliPath = argCliPath;
    if (!cliPath) {
      cliPath = detectCliPath();
      if (!cliPath) {
        console.error("错误: 无法在 PATH 中找到 'claude'，请手动指定 CLI 路径");
        process.exit(1);
      }
    }
    absPath = path.resolve(cliPath);
    if (!fs.existsSync(absPath)) {
      console.error(`错误: 文件不存在: ${absPath}`);
      process.exit(1);
    }
    console.log(`CLI 路径: ${absPath}`);
    const confirmPath = await ask(rl, "确认使用此路径? [Y/n] ");
    if (confirmPath.toLowerCase() === "n") {
      console.log("已取消");
      process.exit(0);
    }

    // --- 2. 确定 Server URL ---
    const serverUrl = argServerUrl || DEFAULT_SERVER_URL;
    console.log(`Server URL: ${serverUrl}`);
    const confirmUrl = await ask(rl, "确认使用此 URL? [Y/n] ");
    if (confirmUrl.toLowerCase() === "n") {
      console.log("已取消");
      process.exit(0);
    }

    // --- 3. 幂等检查 ---
    const bakPath = absPath + ".bak";
    let src = fs.readFileSync(absPath, "utf8");

    if (src.includes("__rcSetPermMode")) {
      if (forceFlag) {
        if (!fs.existsSync(bakPath)) {
          console.error("错误: --force 需要 .bak 文件，但未找到备份");
          process.exit(1);
        }
        console.log("检测到已 patch，--force 模式: 从备份恢复后重新 patch");
        fs.copyFileSync(bakPath, absPath);
        src = fs.readFileSync(absPath, "utf8");
      } else {
        console.log("已检测到 __rcSetPermMode，文件已 patch，跳过。使用 --force 强制重新 patch。");
        process.exit(0);
      }
    }

    // --- 4. 创建备份 ---
    if (!fs.existsSync(bakPath)) {
      fs.copyFileSync(absPath, bakPath);
      console.log(`备份: ${bakPath}`);
    } else {
      console.log(`备份已存在: ${bakPath}`);
    }

    const confirmStart = await ask(rl, "开始 patch? [Y/n] ");
    if (confirmStart.toLowerCase() === "n") {
      console.log("已取消");
      process.exit(0);
    }

    rl.close();

    console.log("\n开始 patch...\n");

    // =====================================================================
    // Steps 1-7: 正则替换
    // =====================================================================

    // Step 1: BASE_API_URL (prod config)
    const prodConfigRe =
      /BASE_API_URL:\s*"([^"]+)"(,\s*CONSOLE_AUTHORIZE_URL:\s*"https:\/\/platform\.claude\.com)/;
    src = patchStep(
      "Step 1: BASE_API_URL",
      src,
      prodConfigRe,
      (_match, _p1, p2) => `BASE_API_URL:"${serverUrl}"${p2}`,
      { min: 1, max: 1 }
    );

    // Step 2: v2 WebSocket 路由
    src = patchStep(
      "Step 2: v2 WebSocket 路由",
      src,
      /\?\s*"v2"\s*:\s*"v1"/g,
      '?"v2":"v2"',
      { min: 1 }
    );

    // Step 3: HTTP 强制检查 (仅当 server 为非 localhost http://)
    const isNonLocalhostHttp =
      serverUrl.startsWith("http://") &&
      !serverUrl.includes("localhost") &&
      !serverUrl.includes("127.0.0.1");
    src = patchStep(
      "Step 3: HTTP 强制检查",
      src,
      /[a-zA-Z_$]+\.startsWith\("http:\/\/"\)\s*&&\s*![a-zA-Z_$]+\.includes\("localhost"\)\s*&&\s*![a-zA-Z_$]+\.includes\("127\.0\.0\.1"\)/g,
      "false",
      { min: 1, max: 1, condition: isNonLocalhostHttp }
    );

    // Step 4: tengu_ccr_bridge sync
    src = patchStep(
      "Step 4: tengu_ccr_bridge sync",
      src,
      /[A-Za-z0-9_]+\("tengu_ccr_bridge",\s*!1\)/g,
      "!0",
      { min: 1 }
    );

    // Step 5a: async flag (CLI 命令)
    src = patchStep(
      "Step 5a: async flag (CLI 命令)",
      src,
      /console\.error\("Error: Remote Control is not yet enabled for your account\."\)\s*,\s*process\.exit\(1\)/,
      "void 0",
      { min: 1, max: 1 }
    );

    // Step 5b: async flag (交互模式)
    src = patchStep(
      "Step 5b: async flag (交互模式)",
      src,
      /return\s*"Remote Control is not enabled\. Wait for the feature flag rollout\."/,
      "return null",
      { min: 1, max: 1 }
    );

    // Step 6: async flag (bridge init)
    src = patchStep(
      "Step 6: async flag (bridge init)",
      src,
      /return [A-Za-z0-9_]+\("tengu_ccr_bridge"\)/g,
      "return !0",
      { min: 1 }
    );

    // Step 7: skipSlashCommands
    src = patchStep(
      "Step 7: skipSlashCommands",
      src,
      /skipSlashCommands:\s*!0/g,
      "skipSlashCommands:!1",
      { min: 0 }
    );

    // =====================================================================
    // Steps 8-10: set_permission_mode (AST 级插入)
    // =====================================================================

    // --- Step 8: 锚点 1 — switch 语句 (initBridgeCore 内) ---
    const REPL_ERR = "REPL bridge does not handle control_request subtype:";
    const errIdx = src.indexOf(REPL_ERR);
    if (errIdx < 0) {
      throw new Error("Step 8: 锚点未找到 — 此版本可能不含 Bridge REPL");
    }

    // 提取 switch 参数名
    const switchArea = src.substring(errIdx - 5000, errIdx);
    const switchParamMatch = switchArea.match(
      /switch\s*\((\w+)\.request\.subtype\)/
    );
    if (!switchParamMatch) {
      throw new Error("Step 8: 无法在 switch 语句中找到 request 参数名");
    }
    const REQ = switchParamMatch[1];

    // 提取 response 变量名
    const respVarMatch = switchArea.match(
      /case\s*"interrupt"[\s\S]*?(\w+)\s*=\s*\{\s*type:\s*"control_response"/
    );
    if (!respVarMatch) {
      throw new Error("Step 8: 无法在 switch 中找到 response 变量名");
    }
    const RESP = respVarMatch[1];

    // 提取 transport 变量名
    const transportMatch = switchArea.match(
      /if\s*\(\s*!(\w+)\s*\)\s*\{[\s\S]*?transport not configured/
    );
    if (!transportMatch) {
      throw new Error("Step 8: 无法找到 transport 变量名");
    }
    const TRANSPORT = transportMatch[1];

    // 提取 session_id 变量名
    const afterErrArea = src.substring(errIdx, errIdx + 500);
    const sessionIdMatch = afterErrArea.match(/session_id:\s*(\w+)\s*\}/);
    if (!sessionIdMatch) {
      throw new Error("Step 8: 无法找到 session_id 变量名");
    }
    const SESSION_ID = sessionIdMatch[1];

    // 定位 break; ... default: 的精确插入点
    const beforeDefault = src.substring(errIdx - 500, errIdx);
    const defaultInSlice = beforeDefault.lastIndexOf("default:");
    if (defaultInSlice < 0) {
      throw new Error("Step 8: 无法定位 default: 标签");
    }
    const breakInSlice = beforeDefault.lastIndexOf("break", defaultInSlice);
    if (breakInSlice < 0) {
      throw new Error("Step 8: 无法定位 break; 语句");
    }
    const absBreakStart = errIdx - 500 + breakInSlice;
    const semiIdx = src.indexOf(";", absBreakStart);
    if (semiIdx < 0 || semiIdx > absBreakStart + 10) {
      throw new Error("Step 8: break 后未找到分号");
    }
    const insertAfterBreak = semiIdx + 1;

    console.log(
      `  Step 8 锚点: REQ=${REQ}, RESP=${RESP}, TRANSPORT=${TRANSPORT}, SESSION_ID=${SESSION_ID}`
    );

    // --- Step 9: 锚点 2+3 — setAppState wrapper (headless/ITz scope) ---
    const wrapperRe =
      /([\w$]+)\s*=\s*\(([\w$]+)\)\s*=>\s*\{\s*([\w$]+)\s*\(\s*\(([\w$]+)\)\s*=>\s*\{\s*let\s+([\w$]+)\s*=\s*\2\s*\(\s*\4\s*\)\s*,\s*([\w$]+)\s*=\s*\4\s*\.toolPermissionContext\.mode\s*,\s*([\w$]+)\s*=\s*\5\s*\.toolPermissionContext\.mode/;
    const wrapperMatch = src.match(wrapperRe);
    if (!wrapperMatch) {
      throw new Error("Step 9: 锚点未找到 — 无法定位 setAppState wrapper");
    }
    const WRAPPER = wrapperMatch[1];
    console.log(`  Step 9 锚点: wrapper=${WRAPPER}`);

    // 在 wrapper 定义之后找 bridge 调用点
    const afterWrapper = src.substring(wrapperMatch.index);
    const permRespRe =
      /onPermissionResponse\s*\(\s*\w+\s*\)\s*\{\s*\w+\s*\.\s*injectControlResponse\s*\(\s*\w+\s*\)/;
    const permRespMatch = afterWrapper.match(permRespRe);
    if (!permRespMatch) {
      throw new Error("Step 9: 无法定位 bridge 调用点");
    }
    const permRespAbsIdx = wrapperMatch.index + permRespMatch.index;

    // 从 onPermissionResponse 向前找 try 块
    const beforePermResp = src.substring(permRespAbsIdx - 2000, permRespAbsIdx);
    let tryMatch = beforePermResp.match(/else\s+try\s*\{/g);
    let tryIdx;
    if (tryMatch) {
      const lastTry = beforePermResp.lastIndexOf("try");
      const braceAfterTry = beforePermResp.indexOf("{", lastTry);
      tryIdx = permRespAbsIdx - 2000 + braceAfterTry + 1;
    } else {
      const lastTry = beforePermResp.lastIndexOf("try{");
      if (lastTry < 0) {
        throw new Error("Step 9: 无法在 bridge 调用点前找到 try 块");
      }
      tryIdx = permRespAbsIdx - 2000 + lastTry + 4;
    }

    // --- Step 10: 锚点 4 — React 组件 scope (可选) ---
    let patch1bIdx = -1;
    let REACT_SET_STATE = null;
    const thinkingRe =
      /onSetMaxThinkingTokens\s*\(\s*([\w$]+)\s*\)\s*\{\s*let\s+[\w$]+\s*=\s*[\w$]+\s*!==\s*null\s*;\s*([\w$]+)\s*\(/;
    const thinkingMatch = src.match(thinkingRe);
    if (!thinkingMatch) {
      console.log("  ⚠ Step 10: 锚点未找到，跳过 React scope 覆盖（Step 9 已提供 __rcSetPermMode）");
    } else {
      REACT_SET_STATE = thinkingMatch[2];
      console.log(`  Step 10 锚点: REACT_SET_STATE=${REACT_SET_STATE}`);

      const afterThinking = src.substring(thinkingMatch.index);
      const rcInitFailStr = "Remote Control initialization failed";
      const rcInitFailIdx = afterThinking.indexOf(rcInitFailStr);
      if (rcInitFailIdx < 0) {
        console.log("  ⚠ Step 10: 无法在 React scope 中找到 bridge 初始化错误文本，跳过");
      } else {
        const searchArea = afterThinking.substring(rcInitFailIdx, rcInitFailIdx + 2000);
        const postInitMatch = searchArea.match(
          /return\s*\}\s*([\w$]+\.current\s*=\s*[\w$]+\s*,\s*[\w$]+\.current\s*=\s*[\w$]+\s*;)/
        );
        if (!postInitMatch) {
          console.log("  ⚠ Step 10: 无法定位 bridge 初始化成功后的插入点，跳过");
        } else {
          patch1bIdx =
            thinkingMatch.index +
            rcInitFailIdx +
            postInitMatch.index +
            postInitMatch[0].length;
        }
      }
    }

    // --- 构建 Patch 代码 ---
    const isMinified = !src
      .substring(insertAfterBreak, insertAfterBreak + 30)
      .includes("\n");

    // Patch 1a: headless/ITz scope 注册 __rcSetPermMode
    let patch1a;
    if (isMinified) {
      patch1a = `globalThis.__rcSetPermMode=(m)=>{${WRAPPER}((s)=>({...s,toolPermissionContext:{...s.toolPermissionContext,mode:m}}))};`;
    } else {
      patch1a = `\n                            globalThis.__rcSetPermMode = (m) => { ${WRAPPER}((s) => ({ ...s, toolPermissionContext: { ...s.toolPermissionContext, mode: m } })) };\n`;
    }

    // Patch 1b: React 组件 scope 注册 __rcSetPermMode (覆盖 1a) — 可选
    let patch1b = null;
    if (patch1bIdx >= 0 && REACT_SET_STATE) {
      if (isMinified) {
        patch1b =
          `globalThis.__rcSetPermMode=(m)=>{${REACT_SET_STATE}((s)=>{` +
          `if(s.toolPermissionContext.mode===m)return s;` +
          `return{...s,toolPermissionContext:{...s.toolPermissionContext,mode:m}}` +
          `})};`;
      } else {
        patch1b =
          `\n                    globalThis.__rcSetPermMode = (m) => {` +
          ` ${REACT_SET_STATE}((s) => {` +
          ` if (s.toolPermissionContext.mode === m) return s;` +
          ` return { ...s, toolPermissionContext: { ...s.toolPermissionContext, mode: m } }` +
          ` })` +
          ` };\n`;
      }
    }

    // Patch 2: switch case + system.status 事件广播
    let patch2;
    if (isMinified) {
      patch2 =
        `case"set_permission_mode":` +
        `if(globalThis.__rcSetPermMode)globalThis.__rcSetPermMode(${REQ}.request.mode);` +
        `if(${TRANSPORT})${TRANSPORT}.write({type:"system",subtype:"status",status:null,permissionMode:${REQ}.request.mode,session_id:${SESSION_ID}});` +
        `${RESP}={type:"control_response",response:{subtype:"success",request_id:${REQ}.request_id,response:{mode:${REQ}.request.mode}}};break;`;
    } else {
      const indentMatch = src
        .substring(insertAfterBreak, insertAfterBreak + 100)
        .match(/\n(\s+)default:/);
      const indent = indentMatch ? indentMatch[1] : "                    ";
      const innerIndent = indent + "    ";
      patch2 =
        `\n${indent}case "set_permission_mode":\n` +
        `${innerIndent}if (globalThis.__rcSetPermMode) globalThis.__rcSetPermMode(${REQ}.request.mode);\n` +
        `${innerIndent}if (${TRANSPORT}) ${TRANSPORT}.write({ type: "system", subtype: "status", status: null, permissionMode: ${REQ}.request.mode, session_id: ${SESSION_ID} });\n` +
        `${innerIndent}${RESP} = {\n` +
        `${innerIndent}    type: "control_response",\n` +
        `${innerIndent}    response: {\n` +
        `${innerIndent}        subtype: "success",\n` +
        `${innerIndent}        request_id: ${REQ}.request_id,\n` +
        `${innerIndent}        response: {\n` +
        `${innerIndent}            mode: ${REQ}.request.mode\n` +
        `${innerIndent}        }\n` +
        `${innerIndent}    }\n` +
        `${innerIndent}};\n` +
        `${innerIndent}break;`;
    }

    // --- 应用 AST 级插入 (从后向前，避免偏移量变化) ---
    const insertions = [
      { pos: tryIdx, code: patch1a, label: "Step 9: __rcSetPermMode (headless)" },
      ...(patch1b && patch1bIdx >= 0
        ? [{ pos: patch1bIdx, code: patch1b, label: "Step 10: __rcSetPermMode (React)" }]
        : []),
      { pos: insertAfterBreak, code: patch2, label: "Step 8: switch case" },
    ].sort((a, b) => b.pos - a.pos);

    for (const ins of insertions) {
      console.log(`  ✓ ${ins.label}: 插入 @ 位置 ${ins.pos}`);
      src = src.substring(0, ins.pos) + ins.code + src.substring(ins.pos);
    }

    // =====================================================================
    // Steps 11-12: Plan Approval — control_response fallback
    // =====================================================================

    // Step 11: whq global registration (Patch A)
    // 在 whq 的 pushToQueue 调用时，将 ToolUseConfirmation 注册到 globalThis
    // 使用 .pushToQueue({ 作为锚点（版本无关，不依赖 minified 变量名）
    // 同时暴露 removeFromQueue 到注册对象，供 fallback 调用
    {
      const PUSH_ANCHOR = ".pushToQueue({";
      const pushIdx = src.indexOf(PUSH_ANCHOR);
      if (pushIdx < 0) throw new Error("Step 11: 锚点未找到 — .pushToQueue({");
      if (src.indexOf(PUSH_ANCHOR, pushIdx + 1) >= 0)
        throw new Error("Step 11: 锚点不唯一 — .pushToQueue({ 出现多次");

      // Extract the caller variable (ctx object) before .pushToQueue(
      // In minified code this is the variable right before the dot, e.g. "K.pushToQueue({..."
      const beforePush = src.substring(Math.max(0, pushIdx - 200), pushIdx);
      const callerMatch = beforePush.match(/(\w+)$/);
      if (!callerMatch) throw new Error("Step 11: 无法提取 pushToQueue 调用对象变量名");
      const CALLER = callerMatch[1];

      src = src.substring(0, pushIdx)
          + `.pushToQueue(globalThis.__rcActiveToolPerm={__removeFromQueue:${CALLER}.removeFromQueue.bind(${CALLER}),`
          + src.substring(pushIdx + PUSH_ANCHOR.length);
      console.log(`  ✓ Step 11: whq global registration (with removeFromQueue via ${CALLER}) @ 位置 ${pushIdx}`);
    }

    // Step 12: Z function fallback (Patch B)
    // 当 Map G 无 handler 时，使用 globalThis.__rcActiveToolPerm 作为 fallback
    {
      const NO_HANDLER = '[bridge:repl] No handler for control_response request_id=';
      const nhIdx = src.indexOf(NO_HANDLER);
      if (nhIdx < 0) throw new Error("Step 12: 锚点未找到 — No handler log");

      // 动态提取消息变量名（Z 函数参数）
      // 从 log 模板中提取 request_id 变量: request_id=${S}
      const reqIdMatch = src.substring(nhIdx, nhIdx + 200).match(/request_id=\$\{(\w+)\}/);
      if (!reqIdMatch) throw new Error("Step 12: 无法提取 request_id 变量名");
      const reqIdVar = reqIdMatch[1];

      // 从 request_id 赋值语句中提取消息变量: let S = L.request_id 或 let S = L.response?.request_id
      const zBefore = src.substring(nhIdx - 1000, nhIdx);
      const msgVarMatch = zBefore.match(new RegExp(`let\\s+${reqIdVar}\\s*=\\s*(\\w+)\\.`));
      if (!msgVarMatch) throw new Error("Step 12: 无法提取消息变量名");
      const MSG = msgVarMatch[1];
      console.log(`  Step 12 锚点: MSG=${MSG}, reqIdVar=${reqIdVar}`);

      // 找到 return 语句
      const returnAfterLog = src.indexOf("return", nhIdx + NO_HANDLER.length);
      if (returnAfterLog < 0 || returnAfterLog > nhIdx + 200)
        throw new Error("Step 12: 找不到 return");

      const fallbackCode =
        `let __p=globalThis.__rcActiveToolPerm;` +
        `if(__p&&${MSG}.response?.response){` +
        `let __r=${MSG}.response.response;` +
        `globalThis.__rcActiveToolPerm=null;` +
        `if(__p.__removeFromQueue){try{__p.__removeFromQueue()}catch(e){}}` +
        `if(__r.behavior==="allow")__p.onAllow(__r.updatedInput,__r.updatedPermissions||[]);` +
        `else if(__r.behavior==="deny")__p.onReject(__r.message);}`;

      src = src.substring(0, returnAfterLog) + fallbackCode + src.substring(returnAfterLog);
      console.log(`  ✓ Step 12: Z function fallback @ 位置 ${returnAfterLog}`);
    }

    // =====================================================================
    // 写入并验证
    // =====================================================================
    fs.writeFileSync(absPath, src, "utf8");
    console.log(`\n已写入: ${absPath}`);

    // 语法检查
    try {
      execSync(`node --check "${absPath}"`, { stdio: "pipe" });
      console.log("语法检查: 通过 ✓");
    } catch (e) {
      console.error("语法检查: 失败 ✗");
      console.error(e.stderr?.toString() || e.message);
      throw new Error("语法检查失败");
    }

    // 验证
    const patched = fs.readFileSync(absPath, "utf8");
    const rcCount = (patched.match(/__rcSetPermMode/g) || []).length;
    const modeCount = (patched.match(/set_permission_mode/g) || []).length;
    const slashCmdCount = (patched.match(/skipSlashCommands:!1/g) || []).length;
    const toolPermCount = (patched.match(/__rcActiveToolPerm/g) || []).length;
    console.log(`\n验证结果:`);
    const expectedMinRc = patch1b ? 4 : 3;
    console.log(`  __rcSetPermMode 出现次数: ${rcCount} (预期 ≥ ${expectedMinRc})`);
    console.log(`  set_permission_mode 出现次数: ${modeCount}`);
    console.log(`  skipSlashCommands:!1 出现次数: ${slashCmdCount}`);
    console.log(`  __rcActiveToolPerm 出现次数: ${toolPermCount} (预期 ≥ 3)`);

    if (rcCount < expectedMinRc) {
      console.warn("警告: __rcSetPermMode 出现次数少于预期");
    }
    if (toolPermCount < 3) {
      console.warn("警告: __rcActiveToolPerm 出现次数少于预期 (需要 Step 11 赋值 + Step 12 读取/清除)");
    }

    console.log("\nPatch 完成!");
    console.log(`备份文件: ${bakPath}`);
    console.log(`\n如果没有 claude.ai 账号，还需设置:`);
    console.log(`  export CLAUDE_CODE_OAUTH_TOKEN=self-hosted`);
  } catch (err) {
    console.error(`\nPatch 失败: ${err.message}`);
    if (absPath) {
      const bakPath = absPath + ".bak";
      if (fs.existsSync(bakPath)) {
        fs.copyFileSync(bakPath, absPath);
        console.error("已从备份恢复原文件");
      }
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
