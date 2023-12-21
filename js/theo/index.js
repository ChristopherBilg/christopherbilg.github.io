/**
 * Theo is a JavaScript UI component for creating a command palette.
 *
 * Theo was built almost entirely using GitHub's Copilot tool for AI generated code.
 *
 * Theo was named after ... TODO: finish this sentence.
 */

import { Keyboard } from "./keyboard.js";

export class TheoCommandPalette extends HTMLElement {
  constructor() {
    super();
    this.hidden = true;
  }

  static get observedAttributes() {
    return [];
  }

  attributeChangedCallback(_attributeName, _oldValue, _newValue) {}

  connectedCallback() {
    const style = document.createElement("style");
    style.textContent = `
      :host {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        max-width: 400px;
        max-height: 400px;
        background-color: #fff;
        border-radius: 4px;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.2);
        padding: 1rem;
        overflow-y: auto;
      }

      :host > div {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      :host > div > div {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
      }

      :host > div > div > button {
        font-size: 1rem;
        background-color: transparent;
        border: 1px solid #000;
        border-radius: 4px;
        padding: 0.5rem 1rem;
        cursor: pointer;
        width: 100%;
      }

      :host > div > div > span {
        font-size: 1rem;
        font-weight: bold;
        align-self: center;
      }
    `;

    const div = document.createElement("div");

    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(div);

    this.setupKeyboard();

    Keyboard.private.bindings
      .filter((binding) => !!binding.commandDesc)
      .forEach((binding) => {
        const commandContainer = document.createElement("div");

        const command = document.createElement("button");
        command.textContent = binding.commandDesc;
        command.onclick = () => {
          binding.commandFunc();
        };
        commandContainer.appendChild(command);

        const commandShortcut = document.createElement("span");
        commandShortcut.textContent = "(";
        commandShortcut.textContent += binding.ctrlKey ? "ctrl+" : "";
        commandShortcut.textContent += binding.altKey ? "alt+" : "";
        commandShortcut.textContent += binding.key ? binding.key : "";
        commandShortcut.textContent += ")";
        commandContainer.appendChild(commandShortcut);

        div.appendChild(commandContainer);
      });
  }

  setupKeyboard() {
    const toggleCommandPaletteHidden = (hidden) => {
      if (hidden !== undefined) {
        this.hidden = hidden;
        return;
      }

      if (this.hidden) {
        this.hidden = undefined;
      } else {
        this.hidden = true;
      }
    };

    const handleLayoutShift = () => {
      // Toggle the ability to scroll the body and set the padding so there isn't any reflow.
      const widthWithScrollBar = document.body.offsetWidth;
      document.body.style.overflow = !this.hidden ? "hidden" : "auto";
      const widthWithoutScrollBar = document.body.offsetWidth;

      const paddingRight = widthWithoutScrollBar - widthWithScrollBar;
      document.body.style.paddingRight = `${Math.max(paddingRight, 0)}px`;

      // Blur all elements that aren't the command palette.
      const elementsToBlur = Array.from(document.querySelectorAll("body > *:not(theo-command-palette):not(script)"));
      elementsToBlur.forEach((element) => {
        element.style.filter = this.hidden ? "" : "blur(4px)";
      });
    };

    Keyboard.attach(document);

    Keyboard.add_binding({
      key: "k",
      ctrlKey: true,
      desc: "Notify 'ctrl+k' || 'ctrl+k' was pressed.",
      callback: () => {
        toggleCommandPaletteHidden();
        handleLayoutShift();
      },
    });

    Keyboard.add_binding({
      key: "/",
      desc: "Notify '/' || '/' was pressed.",
      callback: () => {
        toggleCommandPaletteHidden();
        handleLayoutShift();
      },
    });

    Keyboard.add_binding({
      key: "Escape",
      desc: "Notify 'Escape' || 'Escape' was pressed.",
      callback: () => {
        toggleCommandPaletteHidden(true);
        handleLayoutShift();
      },
    });

    Keyboard.add_binding({
      key: "1",
      ctrlKey: true,
      desc: "Notify 'alt+1' || 'alt+1' was pressed.",
      callback: () => {
        window.location.href = "/";
      },
      commandDesc: "Go to Landing Page",
      commandFunc: function () {
        window.location.href = "/";
      },
    });

    Keyboard.add_binding({
      key: "2",
      ctrlKey: true,
      desc: "Notify 'alt+2' || 'alt+2' was pressed.",
      callback: () => {
        window.location.href = "/portfolio";
      },
      commandDesc: "Go to Portfolio Page",
      commandFunc: function () {
        window.location.href = "/portfolio";
      },
    });

    Keyboard.add_binding({
      key: "3",
      ctrlKey: true,
      desc: "Notify 'alt+3' || 'alt+3' was pressed.",
      callback: () => {
        window.location.href = "/projects";
      },
      commandDesc: "Go to Projects Page",
      commandFunc: function () {
        window.location.href = "/projects";
      },
    });

    Keyboard.add_binding({
      key: "4",
      ctrlKey: true,
      desc: "Notify 'alt+4' || 'alt+4' was pressed.",
      callback: () => {
        window.location.href = "/github";
      },
      commandDesc: "Go to GitHub Page",
      commandFunc: function () {
        window.location.href = "/github";
      },
    });

    Keyboard.add_binding({
      key: "5",
      ctrlKey: true,
      desc: "Notify 'alt+5' || 'alt+5' was pressed.",
      callback: () => {
        window.location.href = "https://www.linkedin.com/in/christopher-bilger/";
      },
      commandDesc: "Go to LinkedIn Profile",
      commandFunc: function () {
        window.location.href = "https://www.linkedin.com/in/christopher-bilger/";
      },
    });

    Keyboard.add_binding({
      key: "6",
      ctrlKey: true,
      desc: "Notify 'alt+6' || 'alt+6' was pressed.",
      callback: () => {
        window.location.href = "/Christopher-Bilger-Resume-November-2023.pdf";
      },
      commandDesc: "Go to Resume (PDF)",
      commandFunc: function () {
        window.location.href = "/Christopher-Bilger-Resume-November-2023.pdf";
      },
    });

    Keyboard.add_binding({
      key: "7",
      ctrlKey: true,
      desc: "Notify 'alt+7' || 'alt+7' was pressed.",
      callback: () => {
        window.location.href = "mailto:christopherbilg@gmail.com";
      },
      commandDesc: "Email Chris",
      commandFunc: function () {
        window.location.href = "mailto:christopherbilg@gmail.com";
      },
    });
  }
}

customElements.define("theo-command-palette", TheoCommandPalette);
