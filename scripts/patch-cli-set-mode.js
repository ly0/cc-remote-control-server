#!/usr/bin/env node
// patch-cli-set-mode.js
// 版本无关的 patch 脚本：为 Bridge REPL 补全 set_permission_mode 支持
// 通过 globalThis.__rcSetPermMode 桥接 setAppState wrapper 与 initBridgeCore switch

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ---------------------------------------------------------------------------
// 0. 参数解析
// ---------------------------------------------------------------------------
const cliPath = process.argv[2];
if (!cliPath) {
  console.error("用法: node patch-cli-set-mode.js <path/to/cli.js>");
  process.exit(1);
}
const absPath = path.resolve(cliPath);
if (!fs.existsSync(absPath)) {
  console.error(`错误: 文件不存在: ${absPath}`);
  process.exit(1);
}

let src = fs.readFileSync(absPath, "utf8");

// ---------------------------------------------------------------------------
// 1. 幂等检查 — 已 patch 则跳过
// ---------------------------------------------------------------------------
if (src.includes("__rcSetPermMode")) {
  console.log("已检测到 __rcSetPermMode，跳过 patch。");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 2. 锚点 1 — switch 语句 (initBridgeCore 内)
//    寻找 "REPL bridge does not handle control_request subtype:" 错误消息，
//    然后向前找到紧邻的 break; ... default: 边界
// ---------------------------------------------------------------------------
const REPL_ERR = "REPL bridge does not handle control_request subtype:";
const errIdx = src.indexOf(REPL_ERR);
if (errIdx < 0) {
  console.error("锚点 1 未找到: 此版本可能不含 Bridge REPL，跳过 patch。");
  process.exit(0);
}

// 从错误消息向前搜索 switch(xxx.request.subtype) 来提取请求参数名
const switchArea = src.substring(errIdx - 5000, errIdx);
const switchParamMatch = switchArea.match(
  /switch\s*\((\w+)\.request\.subtype\)/
);
if (!switchParamMatch) {
  console.error("错误: 无法在 switch 语句中找到 request 参数名");
  process.exit(1);
}
const REQ = switchParamMatch[1]; // e.g. 'r' or 'F6'

// 提取 response 变量名 — 从 case "interrupt" 附近的赋值
const respVarMatch = switchArea.match(
  /case\s*"interrupt"[\s\S]*?(\w+)\s*=\s*\{\s*type:\s*"control_response"/
);
if (!respVarMatch) {
  console.error("错误: 无法在 switch 中找到 response 变量名");
  process.exit(1);
}
const RESP = respVarMatch[1]; // e.g. 'Z6' or 'm6'

// 定位 break; ... default: 的精确插入点
// 找 default: 前最近的 break
const beforeDefault = src.substring(errIdx - 500, errIdx);
const defaultInSlice = beforeDefault.lastIndexOf("default:");
if (defaultInSlice < 0) {
  console.error("错误: 无法定位 default: 标签");
  process.exit(1);
}
const breakInSlice = beforeDefault.lastIndexOf("break", defaultInSlice);
if (breakInSlice < 0) {
  console.error("错误: 无法定位 break; 语句");
  process.exit(1);
}

// 找到 break; 的末尾（含分号）
const absBreakStart = errIdx - 500 + breakInSlice;
const semiIdx = src.indexOf(";", absBreakStart);
if (semiIdx < 0 || semiIdx > absBreakStart + 10) {
  console.error("错误: break 后未找到分号");
  process.exit(1);
}
const insertAfterBreak = semiIdx + 1; // break; 之后

console.log(
  `锚点 1: switch 参数 REQ=${REQ}, RESP=${RESP}, 插入位置=${insertAfterBreak}`
);

// ---------------------------------------------------------------------------
// 3. 锚点 2 — setAppState wrapper
//    查找包含两次 toolPermissionContext.mode 的 wrapper 函数定义
// ---------------------------------------------------------------------------
// 适配 minified 和 non-minified：
// minified:  f=(y)=>{O((r)=>{let Z=y(r),S=r.toolPermissionContext.mode,C=Z.toolPermissionContext.mode
// formatted: f = (y6) => {\n  O((r) => {\n  let Z6 = y6(r),\n  S6 = r.toolPermissionContext.mode,\n  C6 = Z6.toolPermissionContext.mode
const wrapperRe =
  /(\w+)\s*=\s*\((\w+)\)\s*=>\s*\{\s*(\w+)\s*\(\s*\((\w+)\)\s*=>\s*\{\s*let\s+(\w+)\s*=\s*\2\s*\(\s*\4\s*\)\s*,\s*(\w+)\s*=\s*\4\s*\.toolPermissionContext\.mode\s*,\s*(\w+)\s*=\s*\5\s*\.toolPermissionContext\.mode/;
const wrapperMatch = src.match(wrapperRe);
if (!wrapperMatch) {
  console.error("锚点 2 未找到: 无法定位 setAppState wrapper");
  process.exit(1);
}
const WRAPPER = wrapperMatch[1]; // e.g. 'f'
console.log(`锚点 2: wrapper 变量名=${WRAPPER}, 位置=${wrapperMatch.index}`);

// ---------------------------------------------------------------------------
// 4. 锚点 3 — bridge 调用点 (oQz / ITz 作用域内)
//    查找 onPermissionResponse + injectControlResponse，
//    然后向前定位 "else try {" 或 "try {" 作为插入点
// ---------------------------------------------------------------------------
// wrapper 定义之后的 initReplBridge 调用（在同一作用域内）
const afterWrapper = src.substring(wrapperMatch.index);
const permRespRe =
  /onPermissionResponse\s*\(\s*\w+\s*\)\s*\{\s*\w+\s*\.\s*injectControlResponse\s*\(\s*\w+\s*\)/;
const permRespMatch = afterWrapper.match(permRespRe);
if (!permRespMatch) {
  console.error("锚点 3 未找到: 无法定位 bridge 调用点");
  process.exit(1);
}
const permRespAbsIdx = wrapperMatch.index + permRespMatch.index;

// 从 onPermissionResponse 向前找 try { 或 else try {
const beforePermResp = src.substring(
  permRespAbsIdx - 2000,
  permRespAbsIdx
);
// 优先找 "else try {" — 兼容 non-minified
let tryMatch = beforePermResp.match(
  /else\s+try\s*\{/g
);
let tryIdx;
if (tryMatch) {
  // 取最后一个匹配
  const lastTry = beforePermResp.lastIndexOf("try");
  // 精确定位 "try {" 的 { 位置
  const braceAfterTry = beforePermResp.indexOf("{", lastTry);
  tryIdx = permRespAbsIdx - 2000 + braceAfterTry + 1; // { 之后
} else {
  // 退回到 "try{" (minified)
  const lastTry = beforePermResp.lastIndexOf("try{");
  if (lastTry < 0) {
    console.error("错误: 无法在 bridge 调用点前找到 try 块");
    process.exit(1);
  }
  tryIdx = permRespAbsIdx - 2000 + lastTry + 4; // try{ 之后
}
console.log(`锚点 3: globalThis 注册插入位置=${tryIdx}`);

// ---------------------------------------------------------------------------
// 5. 应用 Patch — 先 Patch 2 (switch case)，再 Patch 1 (globalThis 注册)
//    先处理文件后部的修改，以避免偏移量变化影响
// ---------------------------------------------------------------------------

// Patch 2: switch 中增加 case"set_permission_mode"
// 检测缩进风格
const isMinified = !src.substring(insertAfterBreak, insertAfterBreak + 30).includes("\n");
let patch2;
if (isMinified) {
  patch2 =
    `case"set_permission_mode":if(globalThis.__rcSetPermMode)globalThis.__rcSetPermMode(${REQ}.request.mode);` +
    `${RESP}={type:"control_response",response:{subtype:"success",request_id:${REQ}.request_id,response:{mode:${REQ}.request.mode}}};break;`;
} else {
  // non-minified: 匹配现有缩进
  const indentMatch = src.substring(insertAfterBreak, insertAfterBreak + 100).match(/\n(\s+)default:/);
  const indent = indentMatch ? indentMatch[1] : "                    ";
  const innerIndent = indent + "    ";
  patch2 =
    `\n${indent}case "set_permission_mode":\n` +
    `${innerIndent}if (globalThis.__rcSetPermMode) globalThis.__rcSetPermMode(${REQ}.request.mode);\n` +
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

// Patch 1: globalThis 注册
let patch1;
if (isMinified) {
  patch1 = `globalThis.__rcSetPermMode=(m)=>{${WRAPPER}((s)=>({...s,toolPermissionContext:{...s.toolPermissionContext,mode:m}}))};`;
} else {
  patch1 = `\n                            globalThis.__rcSetPermMode = (m) => { ${WRAPPER}((s) => ({ ...s, toolPermissionContext: { ...s.toolPermissionContext, mode: m } })) };\n`;
}

// 确保 Patch 2 插入点在 Patch 1 之后（偏移量方面）
// insertAfterBreak < tryIdx ?
// switch (锚点1) 位于 initBridgeCore 函数内（17685115 附近）
// globalThis 注册（锚点3）在 ITz 函数内（17780954 附近）
// 所以 insertAfterBreak < tryIdx，先插 Patch 2 不影响 Patch 1 的偏移
// 但为安全起见，先做后部修改 (tryIdx)，再做前部修改 (insertAfterBreak)

if (tryIdx > insertAfterBreak) {
  // 先插 Patch 1 (后部)
  src = src.substring(0, tryIdx) + patch1 + src.substring(tryIdx);
  // 再插 Patch 2 (前部 — 不受影响)
  src = src.substring(0, insertAfterBreak) + patch2 + src.substring(insertAfterBreak);
} else {
  // tryIdx <= insertAfterBreak: 先插 Patch 2 (后部)
  src = src.substring(0, insertAfterBreak) + patch2 + src.substring(insertAfterBreak);
  // 再插 Patch 1 (前部)
  src = src.substring(0, tryIdx) + patch1 + src.substring(tryIdx);
}

// ---------------------------------------------------------------------------
// 6. 备份并写入
// ---------------------------------------------------------------------------
const bakPath = absPath + ".bak";
if (!fs.existsSync(bakPath)) {
  fs.copyFileSync(absPath, bakPath);
  console.log(`备份: ${bakPath}`);
} else {
  console.log(`备份已存在: ${bakPath}，跳过备份`);
}
fs.writeFileSync(absPath, src, "utf8");
console.log(`已写入 patched 文件: ${absPath}`);

// ---------------------------------------------------------------------------
// 7. 语法检查
// ---------------------------------------------------------------------------
try {
  execSync(`node --check "${absPath}"`, { stdio: "pipe" });
  console.log("语法检查: 通过 ✓");
} catch (e) {
  console.error("语法检查: 失败 ✗");
  console.error(e.stderr?.toString() || e.message);
  // 恢复备份
  fs.copyFileSync(bakPath, absPath);
  console.error("已从备份恢复原文件");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 8. 验证
// ---------------------------------------------------------------------------
const patched = fs.readFileSync(absPath, "utf8");
const rcCount = (patched.match(/__rcSetPermMode/g) || []).length;
const modeCount = (patched.match(/set_permission_mode/g) || []).length;
console.log(`\n验证结果:`);
console.log(`  __rcSetPermMode 出现次数: ${rcCount} (预期 ≥ 3)`);
console.log(`  set_permission_mode 出现次数: ${modeCount}`);

if (rcCount < 3) {
  console.error("警告: __rcSetPermMode 出现次数少于预期");
}

console.log("\nPatch 完成!");
