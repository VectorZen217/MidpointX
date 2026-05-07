import { extractText } from "./cognitiveNodes";

describe("extractText", () => {
  it("should return the string if content is a simple string", () => {
    expect(extractText("hello world")).toBe("hello world");
  });

  it("should extract text from an array of parts with type 'text'", () => {
    const content = [
      { type: "text", text: "hello " },
      { type: "text", text: "world" },
    ];
    expect(extractText(content)).toBe("hello world");
  });

  it("should filter out parts that do not have type 'text'", () => {
    const content = [
      { type: "image", url: "http://example.com/image.jpg" },
      { type: "text", text: "hello" },
      { type: "video", url: "http://example.com/video.mp4" },
    ];
    expect(extractText(content)).toBe("hello");
  });

  it("should handle parts with type 'text' but missing 'text' property", () => {
    const content = [
      { type: "text", text: "hello " },
      { type: "text" }, // missing text property
      { type: "text", text: "world" },
    ];
    expect(extractText(content)).toBe("hello world");
  });

  it("should fallback to String() for other types like numbers", () => {
    expect(extractText(123)).toBe("123");
  });

  it("should fallback to String() for null", () => {
    expect(extractText(null)).toBe("null");
  });

  it("should fallback to String() for undefined", () => {
    expect(extractText(undefined)).toBe("undefined");
  });

  it("should fallback to String() for plain objects", () => {
    expect(extractText({ key: "value" })).toBe("[object Object]");
  });
});
