#!/usr/bin/env node
"use strict";

const http = require("http");
const pathMod = require("path");
const fs = require("fs");

function readPort(cwd) {
    try {
        const portFile = pathMod.join(cwd, ".brain", "port");
        return parseInt(fs.readFileSync(portFile, "utf-8").trim(), 10) || 0;
    } catch {
        return 0;
    }
}

function httpGet(url, timeout) {
    return new Promise((resolve) => {
        const req = http.get(url, { timeout }, (res) => {
            let data = "";
            res.on("data", (c) => {
                data += c;
            });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(null);
                }
            });
        });
        req.on("error", () => resolve(null));
        req.on("timeout", () => {
            req.destroy();
            resolve(null);
        });
    });
}

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
    input += chunk;
});
process.stdin.on("end", async () => {
    try {
        const payload = JSON.parse(input);
        const cwd = payload.cwd || process.cwd();
        const brainDir = pathMod.join(cwd, ".brain");

        if (!fs.existsSync(brainDir)) {
            process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
            return;
        }

        const filePath = (payload.tool_input || {}).file_path;
        const toolName = payload.tool_name || "";
        const FILE_TOOLS = ["Read", "Edit", "Write"];

        if (!filePath || FILE_TOOLS.indexOf(toolName) < 0) {
            process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
            return;
        }

        const port = readPort(cwd);
        if (!port) {
            process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
            return;
        }

        const params =
            "file=" +
            encodeURIComponent(filePath) +
            "&tool=" +
            encodeURIComponent(toolName) +
            "&root=" +
            encodeURIComponent(cwd);
        const result = await httpGet(
            "http://127.0.0.1:" + port + "/internal/hook-context?" + params,
            3000,
        );

        if (result && result.additionalContext) {
            process.stdout.write(JSON.stringify(result) + "\n");
        } else {
            process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
        }
    } catch {
        process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
    }
});
