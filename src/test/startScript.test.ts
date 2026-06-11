import { describe, expect, it } from "vitest";
import startScript from "../../start-museai.ps1?raw";
import launcherScript from "../../启动MuseAI.bat?raw";

describe("一键启动脚本", () => {
  it("通过 Tauri 开发命令启动桌面应用", () => {
    expect(startScript).toContain("npm run tauri dev");
    expect(startScript).toContain("Assert-Command \"node\"");
    expect(startScript).toContain("Assert-Command \"cargo\"");
  });

  it("提供可双击的 Windows 启动入口", () => {
    expect(launcherScript).toContain("ExecutionPolicy Bypass");
    expect(launcherScript).toContain("start-museai.ps1");
  });
});
