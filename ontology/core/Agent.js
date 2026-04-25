export class Agent {
  constructor(ontology, actions) {
    this.ontology = ontology;
    this.actions = actions;
    this.intents = [
      {
        name: 'depart',
        pattern: /^(?:depart|takeoff)\s+([A-Za-z0-9]+)$/i,
        action: 'departFlight',
        toParams: (m) => ({ flightId: m[1].toUpperCase() }),
        example: 'depart N101AA',
      },
      {
        name: 'land',
        pattern: /^land\s+([A-Za-z0-9]+)$/i,
        action: 'landFlight',
        toParams: (m) => ({ flightId: m[1].toUpperCase() }),
        example: 'land N102AA',
      },
      {
        name: 'cancel',
        pattern: /^cancel\s+([A-Za-z0-9]+)(?:\s+(?:reason:?\s*)?(.+))?$/i,
        action: 'cancelFlight',
        toParams: (m) => ({ flightId: m[1].toUpperCase(), reason: (m[2] || 'unspecified').trim() }),
        example: 'cancel N101AA reason: weather',
      },
      {
        name: 'delay',
        pattern: /^delay\s+([A-Za-z0-9]+)\s+by\s+(\d+)\s*(?:minutes?|mins?|m)\b/i,
        action: 'delayFlight',
        toParams: (m) => ({ flightId: m[1].toUpperCase(), minutes: Number(m[2]) }),
        example: 'delay N105AA by 30 minutes',
      },
      {
        name: 'reassign',
        pattern: /^reassign\s+([A-Za-z0-9]+)\s+(?:to\s+)?(P\d+)$/i,
        action: 'reassignPilot',
        toParams: (m) => ({ flightId: m[1].toUpperCase(), newPilotId: m[2].toUpperCase() }),
        example: 'reassign N101AA to P003',
      },
      {
        name: 'show',
        pattern: /^(?:show|describe|get)\s+([A-Za-z0-9]+)$/i,
        kind: 'read',
        run: (m) => {
          const id = m[1].toUpperCase();
          for (const type of ['Flight', 'Pilot', 'Airport']) {
            const obj = this.ontology.get(type, id);
            if (obj) return { type, state: obj.snapshot() };
          }
          throw new Error(`No object with id "${id}"`);
        },
        example: 'show N101AA',
      },
      {
        name: 'list flights',
        pattern: /^list\s+flights?$/i,
        kind: 'read',
        run: () => ({
          type: 'Flight',
          items: this.ontology.all('Flight').map((f) => ({
            tail_number: f.tail_number,
            status: f.status,
            origin: f.origin,
            destination: f.destination,
            pilot_id: f.pilot_id,
          })),
        }),
        example: 'list flights',
      },
      {
        name: 'list pilots',
        pattern: /^list\s+pilots?$/i,
        kind: 'read',
        run: () => ({
          type: 'Pilot',
          items: this.ontology.all('Pilot').map((p) => ({
            pilot_id: p.pilot_id,
            name: p.name,
            license_level: p.license_level,
            flight_hours: p.flight_hours,
          })),
        }),
        example: 'list pilots',
      },
      {
        name: 'pilots-flying-to',
        pattern: /^pilots?\s+(?:flying\s+)?to\s+([A-Z]+)$/i,
        kind: 'read',
        run: (m) => {
          const code = m[1].toUpperCase();
          const q = this.ontology.query()
            .from('Flight')
            .where((f) => f.destination === code && f.status !== 'Cancelled')
            .traverse('flight_pilot');
          return {
            query: q.describe(),
            type: 'Pilot',
            items: q.collect().map((p) => ({
              pilot_id: p.pilot_id,
              name: p.name,
              experience_tier: p.experience_tier,
            })),
          };
        },
        example: 'pilots to LAX',
      },
      {
        name: 'flights-from',
        pattern: /^flights?\s+from\s+([A-Z]+)$/i,
        kind: 'read',
        run: (m) => {
          const code = m[1].toUpperCase();
          const q = this.ontology.query()
            .from('Flight')
            .where((f) => f.origin === code);
          return {
            query: q.describe(),
            type: 'Flight',
            items: q.collect().map((f) => ({
              tail_number: f.tail_number,
              destination: f.destination,
              status: f.status,
              pilot_name: f.pilot_name,
            })),
          };
        },
        example: 'flights from JFK',
      },
      {
        name: 'destinations-of',
        pattern: /^destinations?\s+(?:of|for)\s+(P\d+)$/i,
        kind: 'read',
        run: (m) => {
          const pilotId = m[1].toUpperCase();
          const q = this.ontology.query()
            .from('Pilot')
            .where((p) => p.pilot_id === pilotId)
            .traverse('pilot_flights')
            .traverse('flight_destination');
          return {
            query: q.describe(),
            type: 'Airport',
            items: q.collect().map((a) => ({ code: a.code, name: a.name, city: a.city })),
          };
        },
        example: 'destinations of P001',
      },
    ];
  }

  ask(prompt) {
    const text = String(prompt || '').trim();
    if (!text) return { error: 'Empty prompt' };

    for (const intent of this.intents) {
      const m = text.match(intent.pattern);
      if (!m) continue;
      try {
        if (intent.kind === 'read') {
          return { intent: intent.name, kind: 'read', result: intent.run(m) };
        }
        const params = intent.toParams(m);
        const cs = this.actions.dispatch(intent.action, params);
        return { intent: intent.name, kind: 'action', action: intent.action, result: cs };
      } catch (err) {
        return { intent: intent.name, error: err.message };
      }
    }

    return {
      error: `No intent matched. Try one of: ${this.intents.map((i) => `"${i.example}"`).join(', ')}`,
    };
  }

  examples() {
    return this.intents.map((i) => i.example);
  }

  getSchema() {
    return {
      ...this.ontology.getSchema(),
      actions: this.actions.getSchema(),
      constraints: this.ontology.constraints?.getSchema() || [],
      intents: this.intents.map((i) => ({
        name: i.name,
        pattern: i.pattern.source,
        kind: i.kind || 'action',
        action: i.action || null,
        example: i.example,
      })),
    };
  }
}
