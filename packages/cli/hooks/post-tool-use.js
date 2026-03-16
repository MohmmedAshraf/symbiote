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

function fireEvent(event, port) {
    const body = JSON.stringify(event);
    const req = http.request(
        {
            hostname: "127.0.0.1",
            port,
            path: "/internal/events",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
            },
            timeout: 1000,
        },
        () => {},
    );
    req.on("error", () => {});
    req.on("timeout", () => req.destroy());
    req.write(body);
    req.end();
}

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
    input += chunk;
});
process.stdin.on("end", () => {
    process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");

    try {
        const payload = JSON.parse(input);
        const cwd = payload.cwd || process.cwd();
        const brainDir = pathMod.join(cwd, ".brain");

        if (!fs.existsSync(brainDir)) return;

        const port = readPort(cwd);
        if (!port) return;

        const toolName = payload.tool_name || "";
        const filePath = (payload.tool_input || {}).file_path;

        if (filePath && (toolName === "Edit" || toolName === "Write")) {
            const relativePath = pathMod.relative(cwd, filePath);
            fireEvent(
                {
                    type: toolName === "Write" ? "file:create" : "file:edit",
                    timestamp: Date.now(),
                    data: { filePath: relativePath, toolName },
                },
                port,
            );
        }

        if (filePath && toolName === "Read") {
            const relativePath = pathMod.relative(cwd, filePath);
            fireEvent(
                {
                    type: "file:read",
                    timestamp: Date.now(),
                    data: { filePath: relativePath, toolName },
                },
                port,
            );
        }
    } catch {
        // never crash
    }
});
