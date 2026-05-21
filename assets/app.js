(() => {
  const API_URL =
    (typeof window !== "undefined" && window.APP_API_URL) ||
    "https://icamedtec.com.br/app/api/login-patient.php";

  function onlyDigits(value) {
    return (value || "").replace(/\D+/g, "");
  }

  function isValidCpfChecksum(cpf) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) {
      return false;
    }

    let sum = 0;
    for (let i = 0; i < 9; i += 1) {
      sum += Number(cpf[i]) * (10 - i);
    }
    let digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    if (digit !== Number(cpf[9])) return false;

    sum = 0;
    for (let i = 0; i < 10; i += 1) {
      sum += Number(cpf[i]) * (11 - i);
    }
    digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    return digit === Number(cpf[10]);
  }

  function extractMagicLink(data) {
    if (!data || typeof data !== "object") return "";

    const candidates = [
      data.magic_link,
      data.magicLink,
      data.shortenedRedirect,
      data.unshortenedRedirect,
      data.patientUrl,
      data.redirect,
      data.url
    ];

    for (const value of candidates) {
      if (typeof value === "string" && value.trim() !== "") {
        return value.trim();
      }
    }

    return "";
  }

  function redirectToMagicLink(url) {
    setStatus("Redirecionando para o acesso seguro...", "success");

    try {
      window.location.assign(url);
      return;
    } catch (_) {
      // fallback para WebViews do iOS/iPadOS
    }

    const opened = window.open(url, "_self");
    if (!opened) {
      window.location.href = url;
    }
  }

  function formatCpf(value) {
    const digits = onlyDigits(value).slice(0, 11);
    const parts = [];
    if (digits.length > 0) parts.push(digits.slice(0, 3));
    if (digits.length > 3) parts.push(digits.slice(3, 6));
    if (digits.length > 6) parts.push(digits.slice(6, 9));
    const suffix = digits.length > 9 ? digits.slice(9, 11) : "";
    let formatted = "";
    if (parts.length > 0) formatted = parts[0];
    if (parts.length > 1) formatted += "." + parts[1];
    if (parts.length > 2) formatted += "." + parts[2];
    if (suffix) formatted += "-" + suffix;
    return formatted;
  }

  function getCaretFromDigitIndex(formattedValue, digitIndex) {
    if (digitIndex <= 0) return 0;
    let digitsSeen = 0;
    for (let i = 0; i < formattedValue.length; i++) {
      if (/\d/.test(formattedValue[i])) {
        digitsSeen += 1;
      }
      if (digitsSeen >= digitIndex) {
        return i + 1;
      }
    }
    return formattedValue.length;
  }

  function setStatus(message, type) {
    const el = document.getElementById("login-status");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("status-message--error", "status-message--success");
    if (type === "error") el.classList.add("status-message--error");
    if (type === "success") el.classList.add("status-message--success");
  }

  function setLoading(isLoading) {
    const btn = document.getElementById("login-button");
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = isLoading ? "Enviando..." : "Acessar Clínica";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const cpfInput = document.getElementById("cpf-input");
    if (!cpfInput) return;

    const raw = cpfInput.value;
    const digits = onlyDigits(raw);

    if (digits.length !== 11) {
      setStatus("Informe um CPF com 11 dígitos.", "error");
      return;
    }

    if (!isValidCpfChecksum(digits)) {
      setStatus("CPF inválido. Verifique os números digitados.", "error");
      return;
    }

    setLoading(true);
    setStatus("Gerando link de acesso, aguarde...", "success");

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ cpf: digits })
      });

      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        data = null;
      }

      if (!response.ok) {
        const apiMessage =
          data && (data.message || data.error)
            ? String(data.message || data.error)
            : "";

        if (response.status === 404) {
          setStatus(
            "CPF não encontrado na clínica. Verifique o cadastro ou entre em contato com o suporte.",
            "error"
          );
          return;
        }

        if (response.status === 400 || response.status === 422) {
          setStatus(
            apiMessage || "CPF inválido. Verifique os números digitados.",
            "error"
          );
          return;
        }

        setStatus(
          apiMessage
            ? "Não foi possível concluir o acesso: " + apiMessage
            : "Não foi possível gerar o link de acesso (erro " + response.status + ").",
          "error"
        );
        return;
      }

      const magicLink = extractMagicLink(data);
      if (magicLink) {
        redirectToMagicLink(magicLink);
      } else {
        setStatus(
          "Não foi possível localizar o link de acesso na resposta.",
          "error"
        );
      }
    } catch (error) {
      if (!navigator.onLine) {
        setStatus(
          "Você está offline. Conecte-se à internet e tente novamente.",
          "error"
        );
      } else {
        setStatus(
          "Ocorreu um erro de comunicação. Tente novamente em instantes.",
          "error"
        );
      }
    } finally {
      setLoading(false);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("login-form");
    const cpfInput = document.getElementById("cpf-input");

    if (cpfInput) {
      cpfInput.addEventListener("input", (e) => {
        const target = e.target;
        const currentValue = target.value;
        const selectionStart = target.selectionStart ?? currentValue.length;
        const digitsBeforeCursor = onlyDigits(
          currentValue.slice(0, selectionStart)
        ).length;
        const formatted = formatCpf(currentValue);
        const nextCursor = getCaretFromDigitIndex(formatted, digitsBeforeCursor);
        target.value = formatted;
        try {
          target.setSelectionRange(nextCursor, nextCursor);
        } catch (_) {
          // iPadOS/Safari pode falhar durante composição do teclado.
        }
      });
    }

    if (form) {
      form.addEventListener("submit", handleSubmit);
    }

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("./sw.js")
          .catch(() => {
            // silencioso: PWA continua funcionando no modo web normal
          });
      });
    }
  });
})();
