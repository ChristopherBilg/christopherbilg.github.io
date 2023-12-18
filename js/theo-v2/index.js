import { Keyboard } from "./keyboard.js";

export class TheoCommandPalette extends HTMLElement {
  constructor() {
    super();
    this.hidden = true;
  }

  static get observedAttributes() {
    return [];
  }

  attributeChangedCallback(attributeName, _oldValue, _newValue) {}

  connectedCallback() {
    const style = document.createElement("style");
    style.textContent = `
      :host {
        position: fixed;
        top: 0;
        left: 0;
      }
    `;

    const div = document.createElement("div");
    div.textContent = "Command Palette!";

    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(div);

    this.setupKeyboard();
  }

  setupKeyboard() {
    Keyboard.attach(document);

    Keyboard.add_binding({
      key: "k",
      ctrlKey: true,
      desc: "Show the command palette",
      callback: () => {
        if (this.hidden) {
          this.hidden = undefined;
        } else {
          this.hidden = true;
        }
      },
    });

    Keyboard.add_binding({
      key: "/",
      desc: "Show the command palette",
      callback: () => {
        if (this.hidden) {
          this.hidden = undefined;
        } else {
          this.hidden = true;
        }
      },
    });

    Keyboard.add_binding({
      key: "Escape",
      desc: "Close the command palette",
      callback: () => {
        this.hidden = true;
      },
    });

    Keyboard.add_binding({
      key: "1",
      ctrlKey: true,
      desc: "Go to Portfolio",
      callback: () => {
        window.location.href = "/portfolio";
      },
    });
  }
}

customElements.define("theo-command-palette", TheoCommandPalette);
