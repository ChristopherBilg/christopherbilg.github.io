export const Keyboard = Object.freeze({
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
