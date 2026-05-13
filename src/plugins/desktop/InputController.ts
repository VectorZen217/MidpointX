import { mouse, keyboard, Key, Point, Button } from "@nut-tree-fork/nut-js";

export class InputController {
  static async mouseMove(x: number, y: number) {
    try {
      await mouse.setPosition(new Point(x, y));
      return { success: true, message: `Moved mouse to ${x}, ${y}` };
    } catch(e: any) {
      return { success: false, message: e.message };
    }
  }

  static async mouseClick(type: 'left' | 'right' | 'double') {
    try {
      if (type === 'right') {
        await mouse.click(Button.RIGHT);
      } else if (type === 'double') {
        await mouse.doubleClick(Button.LEFT);
      } else {
        await mouse.click(Button.LEFT);
      }
      return { success: true, message: `Performed ${type} click` };
    } catch(e: any) {
      return { success: false, message: e.message };
    }
  }

  static async typeText(text: string) {
    try {
      await keyboard.type(text);
      return { success: true, message: `Typed text` };
    } catch(e: any) {
      return { success: false, message: e.message };
    }
  }

  static async pressKey(keyName: string) {
    try {
      // Map string keyName to nut.js Key enum
      let normalizedKey = keyName.toUpperCase();
      // Handle common aliases
      if (normalizedKey === "RETURN") normalizedKey = "ENTER";
      if (normalizedKey === "ESC") normalizedKey = "ESCAPE";
      if (normalizedKey === "CMD") normalizedKey = "COMMAND";
      if (normalizedKey === "WIN") normalizedKey = "COMMAND";
      
      const keyObj = (Key as any)[normalizedKey];
      if (keyObj !== undefined) {
        await keyboard.pressKey(keyObj);
        await keyboard.releaseKey(keyObj);
        return { success: true, message: `Pressed key: ${normalizedKey}` };
      }
      return { success: false, message: `Unknown key: ${keyName}. Available keys include ENTER, TAB, ESCAPE, SPACE, UP, DOWN, LEFT, RIGHT, etc.` };
    } catch(e: any) {
      return { success: false, message: e.message };
    }
  }
}
