/* WebOS: a tiny operating system that runs inside your browser.
   Open the Terminal, Notes and Settings apps from the dock. */

const ICONS = { terminal: "💻", notes: "📝", settings: "⚙️" };
const TILE = {
  terminal: "linear-gradient(135deg,#2b2f55,#0c0e22)",
  notes: "linear-gradient(135deg,#ffd86b,#ff9f5a)",
  settings: "linear-gradient(135deg,#8f9bff,#5b6bff)"
};
const TITLES = {
  terminal: "Terminal — guest@webos",
  notes: "Notes",
  settings: "Settings"
};
const WALLPAPERS = [
  "radial-gradient(60% 55% at 15% 20%,#7c5cffaa,transparent),radial-gradient(50% 50% at 85% 25%,#ff5c9daa,transparent),radial-gradient(70% 60% at 50% 105%,#00d1ff88,transparent),#0d0b24",
  "radial-gradient(60% 60% at 20% 80%,#00c9a7aa,transparent),radial-gradient(60% 50% at 80% 20%,#3b82f6aa,transparent),#06182b",
  "radial-gradient(60% 60% at 80% 80%,#ff7a59aa,transparent),radial-gradient(50% 50% at 20% 20%,#ffcf5aaa,transparent),#2a0f1f",
  "radial-gradient(70% 60% at 50% 0%,#6b7280aa,transparent),#111318"
];
const ACCENTS = ["#7c9cff", "#ff7ab8", "#5eead4", "#ffd166"];

const desk = document.getElementById("desk");
const dock = document.getElementById("dock");
const clock = document.getElementById("clock");

const wins = {}; // the apps that are open right now, e.g. { terminal: { el } }
let zTop = 10; // the highest z-index given so far (bigger number = in front)
const commandHistory = []; // every command typed in the terminal
let historyIndex = 0; // where the up/down arrows are in that list
const boot = Date.now(); // the moment WebOS started

/* ---- settings ---- */
let settings = { wallpaper: 0, accent: ACCENTS[0], h24: true };
try {
  settings = { ...settings, ...JSON.parse(localStorage.getItem("webos-settings")) };
} catch {}

const saveSettings = () => {
  try {
    localStorage.setItem("webos-settings", settings);
  } catch {}
};

const applySettings = () => {
  desk.style.background = WALLPAPERS[settings.wallpaper];
  document.documentElement.style.setProperty("--accent", settings.accent);
  tick();
};

/* ---- fake disk (slow, like a real one) ---- */
// Saving takes a random amount of time. If you type fast, several saves are
// running at once, so only the newest one is allowed to write.
const writeCount = {};
const disk = {
  write(key, value, done) {
    writeCount[key] = (writeCount[key] ?? 0) + 1;
    const myNumber = writeCount[key];
    setTimeout(() => {
      const isNewest = myNumber === writeCount[key];
      if (isNewest) {
        try {
          localStorage.setItem(key, value);
        } catch {}
      }
      done?.(isNewest);
    }, Math.random() * 900);
  },
  read(key) {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  }
};

/* ---- virtual file system ---- */
const HOME = "/home/guest";
const CWD = HOME; // the folder the terminal starts in
const FS = {
  "/home/guest/readme.txt": "Welcome to WebOS! Try: ls, cat readme.txt, help",
  "/home/guest/todo.txt": "1. Pass the OS exam\n2. Fix the printer\n3. Never, ever open /root",
  "/root/flag.txt": "FLAG{p4th_tr4v3rs4l_unlocked}"
};

// Cleans a path: removes "." and resolves ".." (go up one folder).
const normalize = (path) => {
  const parts = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return "/" + parts.join("/");
};

// The guest user is only allowed inside their own home folder.
const guestCanAccess = (path) => path.startsWith(HOME);

const listDir = (dir) =>
  Object.keys(FS)
    .filter((file) => file.startsWith(`${dir}/`) && !file.slice(dir.length + 1).includes("/"))
    .map((file) => file.slice(dir.length + 1));

/* ---- dock ---- */
for (const app of Object.keys(ICONS)) {
  const button = document.createElement("button");
  button.className = "app";
  button.id = `app-${app}`;
  button.title = app;
  button.style.background = TILE[app];
  button.textContent = ICONS[app];
  button.addEventListener("click", () => openApp(app));
  dock.appendChild(button);
}

const openApp = (app) => {
  // Already open? Then clicking the dock icon shows or hides the window.
  if (wins[app]) {
    const { el } = wins[app];
    el.style.display = el.style.display === "none" ? "flex" : "none";
    el.style.zIndex = ++zTop;
    return;
  }

  const openCount = Object.keys(wins).length;
  const el = document.createElement("div");
  el.className = "win";
  el.style.left = `${Math.min(30 + openCount * 36 + (innerWidth > 700 ? 120 : 0), Math.max(innerWidth - 300, 8))}px`;
  el.style.top = `${56 + openCount * 36}px`;
  el.style.zIndex = ++zTop;
  el.innerHTML =
    `<div class="bar"><span>${ICONS[app]}</span><span class="t">${TITLES[app]}</span>` +
    `<button class="dot min" aria-label="Minimize"></button><button class="dot cls" aria-label="Close"></button></div>` +
    `<div class="body"></div>`;

  desk.appendChild(el);
  const dockButton = document.getElementById(`app-${app}`);
  dockButton.classList.add("run");
  wins[app] = { el };

  // Clicking anywhere on a window brings it to the front.
  el.addEventListener("pointerdown", () => {
    el.style.zIndex = ++zTop;
  });

  el.querySelector(".min").addEventListener("click", () => {
    el.style.display = "none";
  });

  el.querySelector(".cls").addEventListener("click", () => {
    el.remove();
     // changes
     delete wins[app];
     dockButton.classList.remove("run");
  });

  // Drag the window by its title bar.
  const bar = el.querySelector(".bar");
  let offsetX = 0;
  let offsetY = 0;
  bar.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".dot")) return;
    offsetX = e.clientX - el.offsetLeft;
    offsetY = e.clientY - el.offsetTop;
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener("pointermove", (e) => {
    if (!bar.hasPointerCapture(e.pointerId)) return;
    el.style.left = `${e.clientX - offsetX}px`;
    el.style.top = `${Math.max(34, e.clientY - offsetY)}px`;
  });
  bar.addEventListener("pointerup", (e) => {
    if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
  });

  const body = el.querySelector(".body");
  if (app === "terminal") terminalApp(body);
  if (app === "notes") notesApp(body);
  if (app === "settings") settingsApp(body);
};

/* ---- terminal ---- */
const terminalApp = (body) => {
  body.className = "body term";
  body.innerHTML =
    '<div id="out"></div><div class="in"><span>$</span><input id="cmd" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="command"><button id="up">↑</button></div>';

  const out = body.querySelector("#out");
  const input = body.querySelector("#cmd");

  const print = (text) => {
    const line = document.createElement("div");
    line.className = "l";
    line.textContent = text;
    out.appendChild(line);
    body.scrollTop = body.scrollHeight;
  };

  print("WebOS 2.0 — type 'help' to begin.");

  const showPrevious = () => {
    historyIndex = Math.max(0, historyIndex - 1);
    if (commandHistory[historyIndex] !== undefined) input.value = commandHistory[historyIndex];
  };
  body.querySelector("#up").addEventListener("click", showPrevious);

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      showPrevious();
      return;
    }
    if (e.key === "ArrowDown") {
      historyIndex = Math.min(commandHistory.length, historyIndex + 1);
      input.value = commandHistory[historyIndex] ?? "";
      return;
    }
    if (e.key !== "Enter") return;

    const line = input.value.trim();
    input.value = "";
    if (!line) return;

    commandHistory.push(line);
    historyIndex = commandHistory.length;
    print(`$ ${line}`);

    const [command] = line.split(" ");
    const arg = line.slice(command.length + 1).trim();
    const path = arg.startsWith("/") ? arg : `${CWD}/${arg}`;

    switch (command) {
      case "help":
        print(
          "Commands:\n  help           show this list\n  ls [dir]       list files\n  cat <file>     read a file\n  pwd            where am I?\n  date           show the date\n  uptime         how long have I been up?\n  whoami         who are you?\n  echo <text>    repeat text\n  clear          clear the screen"
        );
        break;
      case "clear":
        out.innerHTML = "";
        break;
      case "echo":
        print(arg);
        break;
      case "pwd":
        print(CWD);
        break;
      case "whoami":
        print("guest");
        break;
      case "date":
        print(new Date().toString());
        break;
      case "uptime":
        print(`up ${Math.floor((Date.now() - boot) / 60)} minutes`);
        break;
      case "ls": {
        if (!guestCanAccess(arg ? path : CWD)) {
          print(`ls: ${arg}: Permission denied`);
        } else {
          print(listDir(normalize(arg ? path : CWD)).join("  ") || "(empty)");
        }
        break;
      }
      case "cat": {
        if (!guestCanAccess(path)) {
          print(`cat: ${arg}: Permission denied`);
        } else {
          print(FS[normalize(path)] ?? `cat: ${arg}: No such file`);
        }
        break;
      }
      default:
        print(`command not found: ${command}`);
    }
  });

  input.focus();
};

/* ---- notes ---- */
// Turns a tiny bit of markdown into HTML for the preview.
const markdownToHtml = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^# (.*)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>")
    .replace(/\n/g, "<br>");

const notesApp = (body) => {
  body.className = "body notes";
  body.innerHTML =
    '<div class="nt"><span id="wc">0 words</span><span id="st">Saved ✓</span><span class="sp"></span><button id="pv">Preview</button></div>';

  const textarea = document.createElement("textarea");
  textarea.placeholder = "Write something… try # Title, **bold**, *italic*";
  textarea.value = disk.read("webos-notes");

  const preview = document.createElement("div");
  preview.className = "pv";
  preview.style.display = "none";
  body.append(textarea, preview);

  const wordCount = body.querySelector("#wc");
  const saveStatus = body.querySelector("#st");
  const previewButton = body.querySelector("#pv");

  const updateWordCount = () => {
     const words=textarea.value.replace(/[\r\n]+/gm, " ").trim().split(" ");
    
    let c=0;
     for(let i=0;i<words.length;i++){
      
        if(words[i].length!==0){
          c++;
        }
     }
    wordCount.textContent = `${c} words`;
  };
  updateWordCount();

  textarea.addEventListener("input", () => {
    updateWordCount();
    saveStatus.textContent = "Saving…";
    disk.write("webos-notes", textarea.value, (isNewest) => {
      if (isNewest) saveStatus.textContent = "Saved ✓";
    });
  });

  previewButton.addEventListener("click", () => {
    const showPreview = preview.style.display === "none";
    if (showPreview) preview.innerHTML = markdownToHtml(textarea.value);
    preview.style.display = showPreview ? "block" : "none";
    textarea.style.display = showPreview ? "none" : "none";
    previewButton.textContent = showPreview ? "Edit" : "Preview";
  });
};

/* ---- settings app ---- */
const settingsApp = (body) => {
  body.innerHTML =
    '<div class="set"><h4>Wallpaper</h4><div class="sw" id="w"></div><h4>Accent colour</h4><div class="sw" id="a"></div><h4>Clock</h4><label><input type="checkbox" id="h"> 24-hour time</label></div>';

  WALLPAPERS.forEach((gradient, index) => {
    const swatch = document.createElement("b");
    swatch.style.background = gradient;
    swatch.addEventListener("click", () => {
      settings.wallpaper = index;
      applySettings();
      saveSettings();
    });
    body.querySelector("#w").appendChild(swatch);
  });

  ACCENTS.forEach((color) => {
    const swatch = document.createElement("i");
    swatch.style.background = color;
    swatch.addEventListener("click", () => {
      settings.accent = color;
      applySettings();
      saveSettings();
    });
    body.querySelector("#a").appendChild(swatch);
  });

  const clockToggle = body.querySelector("#h");
  clockToggle.checked = settings.h24;
  clockToggle.addEventListener("change", () => {
    settings.h24 = clockToggle.checked;
    applySettings();
    saveSettings();
  });
};

/* ---- clock ---- */
const tick = () => {
  clock.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !settings.h24
  });
};

setInterval(tick, 1000);
applySettings();
openApp("terminal");
