const { useEffect, useRef, useState } = React;

const STORAGE_KEY = "teksher_mzkm_codes_v2";
const COOLDOWN = 1200;

/*
 * Обработка КМ.
 *
 * Сканер иногда возвращает служебный символ перед началом GS1-кода.
 * Для нашего КМ начало — AI 01.
 *
 * Поэтому:
 * - всё ДО первого "01" удаляем;
 * - само "01" сохраняем;
 * - все символы после него сохраняем без изменений;
 * - внутренний GS (ASCII 29 / U+001D) НЕ удаляем.
 */
function normalizeKM(value) {
  if (typeof value !== "string") {
    return "";
  }

  const start = value.indexOf("01");

  if (start === -1) {
    return "";
  }

  return value.slice(start);
}


/*
 * Загружаем сохранённые КМ.
 *
 * Одновременно удаляем возможные старые дубликаты.
 */
function loadCodes() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );

    if (!Array.isArray(saved)) {
      return [];
    }

    const normalized = saved
      .filter(value => typeof value === "string" && value.length)
      .map(normalizeKM)
      .filter(Boolean);

    return [...new Set(normalized)];

  } catch {
    return [];
  }
}

function setScannerFrame(isDuplicate) {
  const reader = document.getElementById("reader");

  if (!reader) {
    return;
  }

  if (isDuplicate) {
    reader.classList.add("scanner-duplicate");
  } else {
    reader.classList.remove("scanner-duplicate");
  }
}

function setScannerFrame(isDuplicate) {
  const reader = document.getElementById("reader");

  if (!reader) return;

  if (isDuplicate) {
    reader.classList.add("scanner-duplicate");
  } else {
    reader.classList.remove("scanner-duplicate");
  }
}

function App() {

  const [codes, setCodes] = useState(loadCodes);

  const [lastCode, setLastCode] = useState("");

  const [status, setStatus] = useState("Ожидание");

  const [running, setRunning] = useState(false);


  /*
   * Ссылка на сканер.
   */
  const scannerRef = useRef(null);


  /*
   * Последний считанный КМ.
   *
   * Нужен для защиты от того,
   * что камера несколько раз подряд
   * отдаёт один и тот же кадр.
   */
  const lastScanRef = useRef({
    code: "",
    time: 0
  });


  /*
   * Set содержит все уже добавленные КМ.
   *
   * В отличие от React state,
   * Set обновляется сразу.
   *
   * Это важно при очень быстром сканировании.
   */
  const codeSetRef = useRef(
    new Set(loadCodes())
  );


  /*
   * Сохраняем список в localStorage.
   */
  useEffect(() => {

    /*
     * На всякий случай ещё раз удаляем дубликаты.
     */
    const uniqueCodes = [...new Set(codes)];

    /*
     * Обновляем Set.
     */
    codeSetRef.current = new Set(uniqueCodes);

    try {

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(uniqueCodes)
      );

    } catch {
      // localStorage недоступен
    }

  }, [codes]);


  /*
   * Добавление КМ.
   */
  const addCode = (value) => {

    if (
      typeof value !== "string" ||
      !value.length
    ) {
      return;
    }


    /*
     * Сначала нормализуем КМ.
     *
     * Например:

     * �010470...
     *
     * превратится в:
     *
     * 010470...
     */
    const km = normalizeKM(value);


    if (!km) {
      return;
    }


    /*
     * Время текущего сканирования.
     */
    const now = Date.now();


    /*
     * Информация о предыдущем сканировании.
     */
    const previous = lastScanRef.current;


    /*
     * Камера может несколько раз вызвать callback
     * для одного и того же изображения.
     *
     * Если это тот же КМ и прошло меньше COOLDOWN,
     * ничего не делаем.
     */
    if (
      previous.code === km &&
      now - previous.time < COOLDOWN
    ) {
      return;
    }


    /*
     * Запоминаем последний КМ.
     */
    lastScanRef.current = {
      code: km,
      time: now
    };


    /*
     * Показываем последний считанный КМ.
     */
    setLastCode(km);


    /*
     * ОСНОВНАЯ ПРОВЕРКА ДУБЛИКАТА.
     *
     * Проверяем Set, а не React state.
     */
    if (codeSetRef.current.has(km)) {

      setStatus("Дубликат — КМ не добавлен");

      setScannerFrame(true);

      beep(false);
      return;
    }

    /*
     * Сразу добавляем КМ в Set.
     *
     * Это происходит ДО setCodes().
     *
     * Поэтому даже если камера моментально
     * вызовет callback ещё раз,
     * этот КМ уже будет считаться существующим.
     */
    setScannerFrame(false);

    codeSetRef.current.add(km);
    
    setCodes(previousCodes => {
      if (previousCodes.includes(km)) {
        return previousCodes;
      }
    
      return [
        ...previousCodes,
        km
      ];

    });


    setStatus("КМ добавлен");

    beep(true);
  };


  /*
   * Запуск камеры.
   */
  const startCamera = async () => {

    if (running) {
      return;
    }


    /*
     * Камера браузера работает только через HTTPS
     * или localhost.
     */
    if (
      !window.isSecureContext &&
      location.hostname !== "localhost"
    ) {

      alert(
        "Для камеры нужен HTTPS. На localhost камера также работает."
      );

      return;
    }


    /*
     * Проверяем наличие библиотеки.
     */
    if (!window.Html5Qrcode) {

      alert(
        "Модуль сканирования не загрузился."
      );

      return;
    }


    /*
     * Создаём сканер.
     */
    const scanner = new Html5Qrcode("reader");

    scannerRef.current = scanner;


    try {

      await scanner.start(

        /*
         * Используем заднюю камеру.
         */
        {
          facingMode: "environment"
        },

        /*
         * Настройки сканирования.
         */
        {
          fps: 10,

          qrbox: {
            width: 260,
            height: 180
          },

          formatsToSupport: [
            Html5QrcodeSupportedFormats.DATA_MATRIX
          ]
        },

        /*
         * Успешное сканирование.
         */
        decodedText => {

          addCode(decodedText);

        },

        /*
         * Ошибки отдельных кадров
         * игнорируем.
         */
        () => { }

      );


      setRunning(true);

      setStatus(
        "Сканирование активно"
      );


    } catch (error) {

      scannerRef.current = null;

      alert(
        "Не удалось запустить камеру. Разрешите доступ к камере в браузере."
      );
    }
  };


  /*
   * Остановка камеры.
   */
  const stopCamera = async () => {

    if (!scannerRef.current) {
      return;
    }


    try {

      await scannerRef.current.stop();

    } catch { }


    try {

      scannerRef.current.clear();

    } catch { }


    scannerRef.current = null;

    setRunning(false);

    setStatus("Ожидание");
  };


  /*
   * Полная очистка.
   */
  const clearAll = () => {

    if (!codes.length) {
      return;
    }


    if (
      !confirm(
        "Удалить все считанные КМ?"
      )
    ) {
      return;
    }


    /*
     * Очищаем Set.
     */
    codeSetRef.current.clear();


    /*
     * Очищаем защиту повторного сканирования.
     */
    lastScanRef.current = {
      code: "",
      time: 0
    };


    /*
     * Очищаем список.
     */
    setCodes([]);


    setLastCode("");

    setStatus("Ожидание");
  };


  /*
   * Экспорт CSV.
   */
  const exportCSV = () => {

    if (!codes.length) {
      return;
    }


    /*
     * ФИНАЛЬНАЯ ЗАЩИТА.
     *
     * Даже если каким-то образом
     * дубликат оказался в массиве,
     * в CSV он не попадёт.
     */
    const uniqueCodes = [
      ...new Set(
        codes
          .map(normalizeKM)
          .filter(Boolean)
      )
    ];


    if (!uniqueCodes.length) {
      return;
    }


    /*
     * ВАЖНО:
     *
     * Здесь НЕТ заголовка.
     *
     * Каждый КМ = отдельная строка.
     *
     * ASCII 29 / GS сохраняется.
     */
    const content =
      uniqueCodes.join("\n") + "\n";


    /*
     * Создаём CSV-файл.
     *
     * TextEncoder позволяет сохранить
     * ASCII 29 без замены.
     */
    const blob = new Blob(
      [
        new TextEncoder().encode(content)
      ],
      {
        type: "text/csv;charset=utf-8"
      }
    );


    /*
     * Создаём ссылку для скачивания.
     */
    const url =
      URL.createObjectURL(blob);


    const a =
      document.createElement("a");


    /*
     * Формируем имя файла.
     */
    const date = new Date();


    const stamp =
      String(date.getDate()).padStart(2, "0") +
      String(date.getMonth() + 1).padStart(2, "0") +
      String(date.getFullYear()).slice(-2) +
      "_" +
      String(date.getHours()).padStart(2, "0") +
      String(date.getMinutes()).padStart(2, "0");

    a.href = url;

    a.download =
      `TeksherMZKM_${stamp}.csv`;


    document.body.appendChild(a);

    a.click();

    a.remove();


    URL.revokeObjectURL(url);
  };


  /*
   * При закрытии страницы
   * останавливаем камеру.
   */
  useEffect(() => {

    return () => {

      if (scannerRef.current) {

        scannerRef.current
          .stop()
          .catch(() => { });

      }

    };

  }, []);


  /*
   * Интерфейс.
   */
  return React.createElement(

    "div",

    null,


    /*
     * HEADER
     */
    React.createElement(
      "header",
      {
        className: "topbar"
      },

      React.createElement(
        "div",
        {
          className: "brand"
        },
        "TEKSHER"
      ),

      React.createElement(
  "div",
  {
    className: "subtitle"
  },

  React.createElement(
    "a",
    {
      href: "https://label.teksher.kg",
      target: "_blank",
      rel: "noopener noreferrer",
      className: "mzkm-link"
    },
    "МЗКМ"
  ),

  " · Сканирование КМ"
)
    ),


    /*
     * MAIN
     */
    React.createElement(
      "main",
      {
        className: "page"
      },


      /*
       * КАМЕРА
       */
      React.createElement(
        "section",
        {
          className: "scanner-card"
        },

        React.createElement(
          "div",
          {
            id: "reader",
            className: "reader"
          }
        ),

        React.createElement(
          "div",
          {
            className: "hint"
          },

          running
            ? "Наведите камеру на код DataMatrix"
            : "Запустите камеру для сканирования"
        ),

        React.createElement(
          "div",
          {
            className: "camera-actions"
          },

          React.createElement(
            "button",
            {
              className: "btn primary",
              onClick: startCamera,
              disabled: running
            },
            "Запустить камеру"
          ),

          React.createElement(
            "button",
            {
              className: "btn secondary",
              onClick: stopCamera,
              disabled: !running
            },
            "Остановить"
          )
        )
      ),


      /*
       * СЧЁТЧИК
       */
      React.createElement(
        "section",
        {
          className: "counter-card"
        },

        React.createElement(
          "span",
          null,
          "Отсканировано"
        ),

        React.createElement(
          "strong",
          null,
          codes.length.toLocaleString("ru-RU")
        )
      ),


      /*
       * ПОСЛЕДНИЙ КМ
       */
      React.createElement(
        "section",
        {
          className: "card"
        },

        React.createElement(
          "div",
          {
            className: "section-title"
          },
          "Последний КМ"
        ),

        React.createElement(
          "div",
          {
            className: "last-code"
          },

          lastCode
            ? displayCode(lastCode)
            : "Готов к сканированию"
        ),

        React.createElement(
          "div",
          {
            className: "status"
          },
          status
        )
      ),


      /*
       * ИСТОРИЯ
       */
      React.createElement(
        "section",
        {
          className: "card"
        },

        React.createElement(
          "div",
          {
            className: "history-head"
          },

          React.createElement(
            "div",
            {
              className: "section-title"
            },
            "История"
          ),

          React.createElement(
            "button",
            {
              className: "text-btn",
              onClick: clearAll
            },
            "Очистить"
          )
        ),


        React.createElement(
          "div",
          {
            className: "history"
          },

          codes
            .slice(-1000)
            .map(
              (code, index) =>

                React.createElement(
                  "div",
                  {
                    className: "row",
                    key: code
                  },

                  React.createElement(
                    "span",
                    {
                      className: "num"
                    },

                    codes.length -
                    Math.min(
                      codes.length,
                      1000
                    ) +
                    index +
                    1
                  ),

                  React.createElement(
                    "span",
                    {
                      className: "code"
                    },

                    displayCode(code)
                  )
                )
            )
        )
      ),


      /*
       * ЭКСПОРТ
       */
      React.createElement(
        "button",
        {
          className: "btn export",
          onClick: exportCSV,
          disabled: !codes.length
        },
        "Скачать CSV"
      )
    )
  );
}


/*
 * Отображение КМ на экране.
 *
 * GS / ASCII 29 показываем как ␝,
 * чтобы пользователь визуально видел
 * разделитель.
 *
 * Сам КМ при этом НЕ изменяется.
 */
function displayCode(code) {

  return code.replace(
    /\x1D/g,
    "␝"
  );
}


/*
 * Звуковой сигнал + вибрация.
 */
function beep(ok) {

  try {

    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;


    if (AudioContext) {

      const ctx =
        new AudioContext();


      const osc =
        ctx.createOscillator();


      const gain =
        ctx.createGain();


      osc.frequency.value =
        ok ? 880 : 220;


      gain.gain.value =
        0.06;


      osc
        .connect(gain)
        .connect(ctx.destination);


      osc.start();


      osc.stop(
        ctx.currentTime + 0.08
      );
    }


    if (navigator.vibrate) {

      navigator.vibrate(
        ok
          ? 40
          : [40, 40, 40]
      );
    }

  } catch { }
}


/*
 * Запуск React.
 */
ReactDOM
  .createRoot(
    document.getElementById("root")
  )
  .render(
    React.createElement(App)
  );