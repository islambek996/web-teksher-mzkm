const { useEffect, useRef, useState } = React;

const STORAGE_KEY = "teksher_mzkm_codes_v1";
const COOLDOWN = 1200;

function App() {
  const [codes, setCodes] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter(x => typeof x === "string" && x) : [];
    } catch {
      return [];
    }
  });

  const [lastCode, setLastCode] = useState("");
  const [status, setStatus] = useState("Ожидание");
  const [running, setRunning] = useState(false);
  const scannerRef = useRef(null);
  const lastScanRef = useRef({ code: "", time: 0 });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
    } catch { }
  }, [codes]);

  const addCode = (value) => {
    if (typeof value !== "string" || !value.length) return;

    const now = Date.now();
    const prev = lastScanRef.current;
    if (prev.code === value && now - prev.time < COOLDOWN) return;
    lastScanRef.current = { code: value, time: now };

    setLastCode(value);

    if (codes.includes(value)) {
      setStatus("Дубликат — КМ не добавлен");
      beep(false);
      return;
    }

    setCodes(prevCodes => [...prevCodes, value]);
    setStatus("КМ добавлен");
    beep(true);
  };

  const startCamera = async () => {
    if (running) return;

    if (!window.isSecureContext && location.hostname !== "localhost") {
      alert("Для камеры нужен HTTPS. На localhost камера также работает.");
      return;
    }

    if (!window.Html5Qrcode) {
      alert("Модуль сканирования не загрузился.");
      return;
    }

    const scanner = new Html5Qrcode("reader");
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 260, height: 180 },
          formatsToSupport: [Html5QrcodeSupportedFormats.DATA_MATRIX]
        },
        decodedText => addCode(decodedText),
        () => { }
      );
      setRunning(true);
      setStatus("Сканирование активно");
    } catch (e) {
      scannerRef.current = null;
      alert("Не удалось запустить камеру. Разрешите доступ к камере в браузере.");
    }
  };

  const stopCamera = async () => {
    if (!scannerRef.current) return;
    try { await scannerRef.current.stop(); } catch { }
    try { scannerRef.current.clear(); } catch { }
    scannerRef.current = null;
    setRunning(false);
    setStatus("Ожидание");
  };

  const clearAll = () => {
    if (!codes.length) return;
    if (!confirm("Удалить все считанные КМ?")) return;
    setCodes([]);
    setLastCode("");
    setStatus("Ожидание");
  };

  const exportCSV = () => {
    if (!codes.length) return;

    // В файл попадают только КМ. Заголовков и других полей нет.
    // U+001D (GS / ASCII 29) сохраняется без замены.
    const content = codes.join("\n") + "\n";
    const blob = new Blob([new TextEncoder().encode(content)], {
      type: "text/csv;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp =
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, "0") +
      String(d.getDate()).padStart(2, "0") + "_" +
      String(d.getHours()).padStart(2, "0") +
      String(d.getMinutes()).padStart(2, "0") +
      String(d.getSeconds()).padStart(2, "0");

    a.href = url;
    a.download = `GS1_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => () => {
    if (scannerRef.current) scannerRef.current.stop().catch(() => { });
  }, []);

  return React.createElement(
    "div",
    null,
    React.createElement("header", { className: "topbar" },
      React.createElement("div", { className: "brand" }, "TEKSHER"),
      React.createElement("div", { className: "subtitle" }, "МЗКМ · Сканирование КМ")
    ),

    React.createElement("main", { className: "page" },
      React.createElement("section", { className: "scanner-card" },
        React.createElement("div", { id: "reader", className: "reader" }),
        React.createElement("div", { className: "hint" },
          running ? "Наведите камеру на код DataMatrix" : "Запустите камеру для сканирования"
        ),
        React.createElement("div", { className: "camera-actions" },
          React.createElement("button", {
            className: "btn primary",
            onClick: startCamera,
            disabled: running
          }, "Запустить камеру"),
          React.createElement("button", {
            className: "btn secondary",
            onClick: stopCamera,
            disabled: !running
          }, "Остановить")
        )
      ),

      React.createElement("section", { className: "counter-card" },
        React.createElement("span", null, "Отсканировано"),
        React.createElement("strong", null, codes.length.toLocaleString("ru-RU"))
      ),

      React.createElement("section", { className: "card" },
        React.createElement("div", { className: "section-title" }, "Последний КМ"),
        React.createElement("div", { className: "last-code" },
          lastCode ? displayCode(lastCode) : "Готов к сканированию"
        ),
        React.createElement("div", { className: "status" }, status)
      ),

      React.createElement("section", { className: "card" },
        React.createElement("div", { className: "history-head" },
          React.createElement("div", { className: "section-title" }, "История"),
          React.createElement("button", { className: "text-btn", onClick: clearAll }, "Очистить")
        ),
        React.createElement("div", { className: "history" },
          codes.slice(-1000).map((code, index) =>
            React.createElement("div", { className: "row", key: code },
              React.createElement("span", { className: "num" },
                codes.length - Math.min(codes.length, 1000) + index + 1
              ),
              React.createElement("span", { className: "code" }, displayCode(code))
            )
          )
        )
      ),

      React.createElement("button", {
        className: "btn export",
        onClick: exportCSV,
        disabled: !codes.length
      }, "Скачать CSV")
    )
  );
}

function displayCode(code) {
  return code.replace(/\x1D/g, "␝");
}

function beep(ok) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = ok ? 880 : 220;
      gain.gain.value = 0.06;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    }
    if (navigator.vibrate) navigator.vibrate(ok ? 40 : [40, 40, 40]);
  } catch { }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(App)
);
