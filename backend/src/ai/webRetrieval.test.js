import assert from "node:assert/strict";
import test from "node:test";
import { appendSourceList, buildWebContext, buildWebSearchQuery } from "./webRetrieval.js";

const document = {
  nodes: [
    { id: "n1", data: { label: "Tán xạ Rayleigh", note: "Bầu trời màu xanh vì ánh sáng bước sóng ngắn tán xạ mạnh." } },
  ],
};

test("quick Teacher actions search from the selected note rather than their generic instruction", () => {
  const query = buildWebSearchQuery({
    document,
    nodeId: "n1",
    mode: "verify",
    message: "Hãy kiểm chứng duy nhất note này và viết lại.",
  });
  assert.match(query, /Tán xạ Rayleigh/);
  assert.match(query, /Bầu trời màu xanh/);
  assert.doesNotMatch(query, /Hãy kiểm chứng/);
});

test("dedicated RAG modes also build the query from the selected note", () => {
  const query = buildWebSearchQuery({
    document,
    nodeId: "n1",
    mode: "explain_rag",
    message: "Một chỉ dẫn chung không nên thay thế nội dung note.",
  });
  assert.match(query, /Tán xạ Rayleigh/);
  assert.doesNotMatch(query, /chỉ dẫn chung/);
});

test("web evidence is numbered and persisted answers retain source URLs", () => {
  const sources = [{ title: "Nguồn khoa học", url: "https://example.edu/a", snippet: "Một bằng chứng." }];
  assert.match(buildWebContext(sources), /\[1\] Nguồn khoa học/);
  assert.match(buildWebContext(sources), /Trích đoạn: Một bằng chứng/);
  assert.equal(
    appendSourceList("Kết luận có dẫn nguồn [1].", sources),
    "Kết luận có dẫn nguồn [1].\n\nNguồn tham khảo:\n[1] Nguồn khoa học — https://example.edu/a"
  );
});
