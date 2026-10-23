// REST API under /api (mounted by server.js behind requireAuth). Thin over repo.js.
import express from 'express';
import * as repo from './repo.js';
import { bus } from './events.js';

export const apiRouter = express.Router();
apiRouter.use(express.json({ limit: '2mb' }));   // no-op when server.js already parsed the body

apiRouter.get('/health', (req, res) => res.json({ ok: true }));

// words
apiRouter.get('/words', (req, res) => res.json(repo.listWords(req.query)));
apiRouter.post('/words', (req, res) => res.status(201).json(repo.addWord(req.body)));
apiRouter.patch('/words/:id', (req, res) => res.json(repo.updateWord(req.params.id, req.body)));
apiRouter.delete('/words/:id', (req, res) => res.json(repo.deleteWord(req.params.id)));
apiRouter.post('/words/:id/result', (req, res) => res.json(repo.recordPracticeResult(req.params.id, req.body)));
apiRouter.post('/words/:id/errors', (req, res) => res.json(repo.logWordError(req.params.id, req.body)));
apiRouter.get('/topics', (req, res) => res.json(repo.listTopics()));

// rules
apiRouter.get('/rules', (req, res) => res.json(repo.listRules()));
apiRouter.post('/rules', (req, res) => res.status(201).json(repo.addRule(req.body)));
apiRouter.get('/rules/:id', (req, res) => res.json(repo.getRule(req.params.id)));
apiRouter.patch('/rules/:id', (req, res) => res.json(repo.updateRule(req.params.id, req.body)));
apiRouter.delete('/rules/:id', (req, res) => res.json(repo.deleteRule(req.params.id)));

// mistake patterns and cases
apiRouter.get('/mistake-patterns', (req, res) => res.json(repo.listPatterns({
  rule_id: req.query.rule_id,
  rule_code: req.query.rule_code ?? req.query.rule,
})));
apiRouter.get('/mistake-patterns/:id', (req, res) => res.json(repo.getPattern(req.params.id)));
apiRouter.post('/mistake-patterns', (req, res) => res.status(201).json(repo.addPattern(req.body)));
apiRouter.delete('/mistake-patterns/:id', (req, res) => res.json(repo.deletePattern(req.params.id)));
apiRouter.post('/mistake-patterns/:id/cases', (req, res) => res.json(repo.addCase(req.params.id, req.body)));
apiRouter.delete('/mistake-cases/:id', (req, res) => res.json(repo.deleteCase(req.params.id)));
apiRouter.post('/mistakes/log', (req, res) => res.json(repo.logMistake(req.body)));

// phrases
apiRouter.get('/phrases', (req, res) => res.json(repo.listPhrases()));
apiRouter.post('/phrases', (req, res) => res.status(201).json(repo.addPhrase(req.body)));
apiRouter.delete('/phrases/:id', (req, res) => res.json(repo.deletePhrase(req.params.id)));

// texts
apiRouter.get('/texts', (req, res) => res.json(repo.listTexts()));
apiRouter.get('/texts/:id', (req, res) => res.json(repo.getText(req.params.id)));
apiRouter.post('/texts', (req, res) => res.status(201).json(repo.addText(req.body)));
apiRouter.patch('/texts/:id', (req, res) => res.json(repo.updateText(req.params.id, req.body)));
apiRouter.delete('/texts/:id', (req, res) => res.json(repo.deleteText(req.params.id)));

apiRouter.get('/stats', (req, res) => res.json(repo.stats()));

apiRouter.get('/export', (req, res) => {
  res.attachment(`dutch-export-${repo.todayIso()}.json`);
  res.json(repo.exportAll());
});

// Live updates: every repo write emits a 'change' on the bus.
apiRouter.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': connected\n\n');
  const onChange = evt => res.write(`event: change\ndata: ${JSON.stringify(evt)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  bus.on('change', onChange);
  req.on('close', () => {
    clearInterval(ping);
    bus.off('change', onChange);
    res.end();
  });
});

apiRouter.use((req, res) => res.status(404).json({ error: 'not found' }));

// eslint-disable-next-line no-unused-vars
apiRouter.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message });
});
