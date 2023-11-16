/**
 * Theo is a JavaScript UI component for creating a command palette.
 *
 * Theo was built almost entirely using GitHub's Copilot tool for AI generated code.
 *
 * Theo was named after ... TODO: finish this sentence.
 */

(() => {
  // Declarative-style Keyboard is from: https://stackoverflow.com/questions/5203407/how-to-detect-if-multiple-keys-are-pressed-at-once-using-javascript/12444641#12444641
  const Keyboard = Object.freeze({
    final: Object.freeze({
      bind_proto: Object.freeze({
        key: null,
        ctrlKey: false,
        altKey: false,
        desc: null,
        callback: null,
      }),
    }),

    private: Object.seal({
      el: null,
      bindings: null,
      ev_keydown_ptr: null,
    }),

    public: Object.seal({
      /* (nothing here yet) */
    }),

    _mkbind: function (bind) {
      let self = this;

      return Object.seal({ ...self.final.bind_proto, ...bind });
    },

    _binding_filter: function (search) {
      return (bind) => bind.altKey === search.altKey && bind.ctrlKey === search.ctrlKey && bind.key === search.key;
    },

    _binding_lookup: function (bind) {
      let self = this;
      let result = self.private.bindings.find(self._binding_filter(bind));

      if (typeof result === "undefined") return null;

      return result;
    },

    _ev_keydown: function () {
      let self = this;

      return function (ev) {
        let result = self._binding_lookup(ev);

        if (result === null) return;

        ev.preventDefault();
        result.callback(ev);
      };
    },

    _get_label: function (binding) {
      let ret = binding.key;

      if ("ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(binding.key) !== -1) ret = "shift-" + ret;

      if (binding.ctrlKey) ret = "ctrl-" + ret;

      if (binding.altKey) ret = "alt-" + ret;

      return ret;
    },

    _pad_left: function (text, width) {
      while (text.length < width) text = " " + text;

      return text;
    },

    attach: function (el) {
      let self = this;

      self.private.ev_keydown_ptr = self._ev_keydown();
      self.private.el = el;
      self.private.el.tabIndex = 0;
      self.private.el.addEventListener("keydown", self.private.ev_keydown_ptr);
      self.private.bindings = [];
    },

    detach: function () {
      let self = this;

      if (self.private.el === null) return;

      self.private.el.removeEventListener("keydown", self.private.ev_keydown_ptr);
    },

    add_binding: function (bind) {
      let self = this;
      let bind_proper = self._mkbind(bind);
      let result = self._binding_lookup(bind_proper);

      if (result !== null) return false;

      self.private.bindings.push(bind_proper);
      return true;
    },

    remove_binding: function (bind) {
      let self = this;
      let bind_proper = self._mkbind(bind);
      let result = self._binding_lookup(bind_proper);
      let index = self.private.bindings.indexOf(result);

      if (result === null || index === -1) return false;

      self.private.bindings.splice(index, 1);
      return true;
    },

    list_bindings: function () {
      let self = this;
      let out = "";
      let labels = self.private.bindings.map(self._get_label);
      let longest = labels.map((l) => l.length).reduce((a, b) => (a > b ? a : b), 0);

      labels
        .map((label) => self._pad_left(label, longest))
        .forEach(function (label, i) {
          out += `${label}  ${self.private.bindings[i].desc}\n`;
        });

      return out;
    },
  });

  Keyboard.attach(document);

  const bindings = [
    {
      key: "k",
      ctrlKey: true,
      desc: "Notify 'ctrl+k' || 'ctrl+k' was pressed.",
      callback: function (_ev) {
        handleCommandPaletteOpenCloseToggle();
      },
    },
    {
      key: "/",
      desc: "Notify '/' || '/' was pressed.",
      callback: function (_ev) {
        handleCommandPaletteOpenCloseToggle();
      },
    },
    {
      key: "1",
      altKey: true,
      desc: "Notify 'alt+1' || 'alt+1' was pressed.",
      callback: function (_ev) {
        window.location.href = "/portfolio/";
      },
      commandDesc: "Go to Portfolio",
      commandFunc: function () {
        window.location.href = "/portfolio/";
      },
      label: "alt+1",
    },
    {
      key: "2",
      altKey: true,
      desc: "Notify 'alt+2' || 'alt+2' was pressed.",
      callback: function (_ev) {
        window.location.href = "/projects/";
      },
      commandDesc: "Go to Projects",
      commandFunc: function () {
        window.location.href = "/projects/";
      },
      label: "alt+2",
    },
    {
      key: "3",
      altKey: true,
      desc: "Notify 'alt+3' || 'alt+3' was pressed.",
      callback: function (_ev) {
        window.location.href = "/github/";
      },
      commandDesc: "Go to GitHub",
      commandFunc: function () {
        window.location.href = "/github/";
      },
      label: "alt+3",
    },
    {
      key: "4",
      altKey: true,
      desc: "Notify 'alt+4' || 'alt+4' was pressed.",
      callback: function (_ev) {
        window.location.href = "https://www.linkedin.com/in/christopher-bilger/";
      },
      commandDesc: "Go to LinkedIn",
      commandFunc: function () {
        window.location.href = "https://www.linkedin.com/in/christopher-bilger/";
      },
      label: "alt+4",
    },
    {
      key: "5",
      altKey: true,
      desc: "Notify 'alt+5' || 'alt+5' was pressed.",
      callback: function (_ev) {
        window.location.href = "/Christopher-Bilger-Resume-August-2023.pdf";
      },
      commandDesc: "Go to Resume",
      commandFunc: function () {
        window.location.href = "/Christopher-Bilger-Resume-August-2023.pdf";
      },
      label: "alt+5",
    },
    {
      key: "6",
      altKey: true,
      desc: "Notify 'alt+6' || 'alt+6' was pressed.",
      callback: function (_ev) {
        window.location.href = "mailto:christopherbilg@gmail.com";
      },
      commandDesc: "Email Chris",
      commandFunc: function () {
        window.location.href = "mailto:christopherbilg@gmail.com";
      },
      label: "alt+6",
    },
    {
      key: "7",
      altKey: true,
      desc: "Notify 'alt+7' || 'alt+7' was pressed.",
      callback: function (_ev) {
        window.location.href = "/electronics/";
      },
      commandDesc: "Go to Electronics",
      commandFunc: function () {
        window.location.href = "/electronics/";
      },
      label: "alt+7",
    },
    {
      key: "8",
      altKey: true,
      desc: "Notify 'alt+8' || 'alt+8' was pressed.",
      callback: function (_ev) {
        window.location.href = "/";
      },
      commandDesc: "Go to Landing Page",
      commandFunc: function () {
        window.location.href = "/";
      },
      label: "alt+8",
    },
  ];

  bindings.forEach((binding) => {
    Keyboard.add_binding(binding);
  });

  let isCommandPaletteOpen = false;

  const handleCommandPaletteOpenCloseToggle = () => {
    isCommandPaletteOpen = !isCommandPaletteOpen;

    // Toggle the ability to scroll the body and set the padding so there isn't any reflow.
    const widthWithScrollBar = document.body.offsetWidth;
    document.body.style.overflow = isCommandPaletteOpen ? "hidden" : "auto";
    const widthWithoutScrollBar = document.body.offsetWidth;

    const paddingRight = widthWithoutScrollBar - widthWithScrollBar;
    document.body.style.paddingRight = `${Math.max(paddingRight, 0)}px`;

    // Toggle the hidden state of the command palette.
    const commandPalette = document.querySelector("#command-palette");
    commandPalette.hidden = isCommandPaletteOpen ? false : true;

    // Focus the search input when the command palette is opened.
    if (isCommandPaletteOpen) {
      const searchInput = document.querySelector("#command-palette .command-palette__body__search input");
      searchInput.focus();
    }
  };

  // Create an HTMLElement of the command palette and append to the body.
  const commandPalette = document.createElement("div");
  commandPalette.id = "command-palette";
  commandPalette.hidden = true;
  commandPalette.innerHTML = `
    <div class="command-palette__header">
      <div class="command-palette__header__close-button">X</div>
    </div>
    <div class="command-palette__body">
      <div class="command-palette__body__search">
        <input type="text" placeholder="Search..." />
      </div>
      <div class="command-palette__body__commands">
        ${bindings
          .map((binding) => {
            return binding.commandDesc
              ? `
                <div class="command-palette__body__commands__command">
                  <div class="command-palette__body__commands__command__key">${binding.label}</div>
                  <div class="command-palette__body__commands__command__desc">${binding.commandDesc}</div>
                </div>
              `
              : "";
          })
          .join("")}
      </div>
    </div>
  `;
  document.body.appendChild(commandPalette);

  // Style the command palette using CSS to be a vertically and horizontally centered modal.
  const commandPaletteStyle = document.createElement("style");

  // When the command palette is hidden, use command-palette__hide animation.
  commandPaletteStyle.innerHTML = `
    #command-palette {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 400px;
      height: 400px;
      background-color: #fff;
      border-radius: 4px;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.2);
      animation: command-palette__show 0.2s ease-in-out;
      animation-fill-mode: forwards;
      z-index: 9999;
    }

    @keyframes command-palette__show {
      0% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.9);
      }
      100% {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }

    #command-palette .command-palette__header {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      height: 40px;
      padding: 0 10px;
      border-bottom: 1px solid #eaecef;
    }

    #command-palette .command-palette__header__close-button {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 30px;
      height: 30px;
      border-radius: 4px;
      cursor: pointer;
    }

    #command-palette .command-palette__body {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    #command-palette .command-palette__body__search {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 40px;
      padding: 0 10px;
      border-bottom: 1px solid #eaecef;
    }

    #command-palette .command-palette__body__search input {
      width: 100%;
      height: 100%;
      padding: 0 10px;
      border: 1px solid #eaecef;
      border-radius: 4px;
      outline: none;
    }

    #command-palette .command-palette__body__commands {
      display: flex;
      flex-direction: column;
      flex-grow: 1;
      overflow-y: auto;
      max-height: calc(315px);
    }

    #command-palette .command-palette__body__commands__command {
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 40px;
      padding: 0 10px;
      border-bottom: 1px solid #eaecef;
      line-height: 40px;
    }

    #command-palette .command-palette__body__commands__command:last-child {
      border-bottom: none;
    }

    #command-palette .command-palette__body__commands__command__key {
      display: flex;
      justify-content: center;
      align-items: center;
      width: auto;
      height: 30px;
      border-radius: 4px;
      background-color: #eaecef;
      padding: 0 10px;
    }

    #command-palette .command-palette__body__commands__command__desc {
      display: flex;
      justify-content: center;
      align-items: center;
      width: calc(100% - 40px);
      height: 100%;
      padding: 0 10px;
    }

    #command-palette .command-palette__body__commands__command:hover {
      background-color: #f6f8fa;
    }

    #command-palette .command-palette__body__commands__command:focus {
      background-color: #f6f8fa;
    }

    #command-palette .command-palette__body__commands__command__key {
      font-family: monospace;
      font-size: 14px;
      font-weight: 600;
      color: #444d56;
    }

    #command-palette .command-palette__body__commands__command__desc {
      font-family: monospace;
      font-size: 14px;
      font-weight: 400;
      color: #444d56;
    }

    #command-palette .command-palette__body__commands__command:hover .command-palette__body__commands__command__key {
      color: #0366d6;
    }

    #command-palette .command-palette__body__commands__command:hover .command-palette__body__commands__command__desc {
      color: #0366d6;
    }
  `;
  document.head.appendChild(commandPaletteStyle);

  // Add event listeners to the command palette.
  const commandPaletteHeaderCloseButton = document.querySelector(
    "#command-palette .command-palette__header__close-button"
  );
  commandPaletteHeaderCloseButton.addEventListener("click", () => {
    handleCommandPaletteOpenCloseToggle();
  });

  // Add functionality so that when I click on a command on the command palette, it will execute the command.
  const handleCommand = (commandPaletteCommand) => {
    const commandPaletteCommandDesc = commandPaletteCommand.querySelector(
      ".command-palette__body__commands__command__desc"
    );

    const binding = bindings.find((binding) => binding.commandDesc === commandPaletteCommandDesc.textContent);
    if (binding) {
      binding.commandFunc();
    }

    handleCommandPaletteOpenCloseToggle();

    const commandPaletteBodySearchInput = document.querySelector(
      "#command-palette .command-palette__body__search input"
    );
    commandPaletteBodySearchInput.value = "";

    const commandPaletteBodyCommands = document.querySelectorAll(
      "#command-palette .command-palette__body__commands__command"
    );
    commandPaletteBodyCommands.forEach((commandPaletteBodyCommand) => {
      commandPaletteBodyCommand.style.display = "flex";
    });
  };

  const commandPaletteCommands = document.querySelectorAll(
    "#command-palette .command-palette__body__commands__command"
  );
  commandPaletteCommands.forEach((commandPaletteCommand) => {
    commandPaletteCommand.addEventListener("click", () => {
      handleCommand(commandPaletteCommand);
    });
  });

  // Add functionality so that when I type in the search box, it will filter the commands.
  const handleCommandPaletteSearch = () => {
    const commandPaletteBodySearchInput = document.querySelector(
      "#command-palette .command-palette__body__search input"
    );
    const commandPaletteBodyCommands = document.querySelectorAll(
      "#command-palette .command-palette__body__commands__command"
    );
    commandPaletteBodyCommands.forEach((commandPaletteBodyCommand) => {
      const commandPaletteBodyCommandDesc = commandPaletteBodyCommand.querySelector(
        ".command-palette__body__commands__command__desc"
      );
      if (
        commandPaletteBodyCommandDesc.textContent
          .toLowerCase()
          .includes(commandPaletteBodySearchInput.value.toLowerCase())
      ) {
        commandPaletteBodyCommand.style.display = "flex";
      } else {
        commandPaletteBodyCommand.style.display = "none";
      }
    });
  };

  const commandPaletteBodySearchInput = document.querySelector("#command-palette .command-palette__body__search input");
  commandPaletteBodySearchInput.addEventListener("input", () => {
    handleCommandPaletteSearch();
  });
})();
