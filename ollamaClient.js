export async function chatOllama(messages) {
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3.1:8b",
      messages,
      stream: false
    }),
  });

  const data = await res.json();
  return data.message.content;
}
