const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const OpenAI = require('openai');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const TOPICS = {
  'Normalization (2NF)': {
    icon: '🗂️',
    color: 'violet',
    keyIdeas: [
      'the relation is already in 1NF',
      'a partial dependency occurs when a non-key attribute depends on only part of a composite primary key',
      '2NF removes partial dependencies by decomposition',
      '2NF is relevant when the primary key is composite'
    ],
    sample: '2NF means the relation is already in 1NF and has no partial dependency. A non-key attribute should depend on the whole composite primary key, not just one part of it. We can decompose the relation to remove partial dependencies.',
    challenge: 'Can you give a tiny example showing a partial dependency?'
  },
  'Binary Search': {
    icon: '🔎',
    color: 'blue',
    keyIdeas: [
      'the data must be sorted or ordered',
      'the algorithm checks the middle element',
      'each step discards about half of the remaining search space',
      'the time complexity is O(log n)'
    ],
    sample: 'Binary search works on sorted data. We compare the target with the middle element, then keep only the left or right half. Because the search space is halved repeatedly, the time complexity is O(log n).',
    challenge: 'Why does halving the search space lead to O(log n)?'
  },
  'Overfitting (ML)': {
    icon: '🧠',
    color: 'pink',
    keyIdeas: [
      'the model learns training data too closely, including noise',
      'training performance is high while unseen or test performance is poor',
      'excessive model complexity can contribute to overfitting',
      'regularization, more data, or a simpler model can help'
    ],
    sample: 'Overfitting happens when a model learns the training examples too closely, including noise. It may have high training accuracy but poor performance on unseen data. Regularization, more data, or a simpler model can improve generalization.',
    challenge: 'How would you explain overfitting using a student who memorizes answers?'
  },
  'BFS vs DFS': {
    icon: '🧭',
    color: 'cyan',
    keyIdeas: [
      'BFS explores level by level',
      'DFS explores deeply before backtracking',
      'BFS commonly uses a queue while DFS commonly uses a stack or recursion',
      'both are useful graph or tree traversal strategies'
    ],
    sample: 'BFS visits nodes level by level and usually uses a queue. DFS goes as deep as possible before backtracking and uses a stack or recursion. Both traverse graphs or trees, but they suit different problems.',
    challenge: 'Which traversal would you choose for the shortest path in an unweighted graph, and why?'
  },
  'Big-O Time Complexity': {
    icon: '⏱️',
    color: 'amber',
    keyIdeas: [
      'Big-O describes how resource usage grows as input size grows',
      'it focuses on the dominant growth behavior rather than exact constants',
      'O(1), O(log n), O(n), and O(n²) describe different growth rates',
      'lower growth rates are generally better for large inputs'
    ],
    sample: 'Big-O describes how an algorithm scales as the input size increases. We focus on the dominant growth term and ignore constant factors. For example, O(log n) generally grows much slower than O(n²) for large inputs.',
    challenge: 'Why do we ignore constant factors when describing Big-O?'
  },
  'SQL JOINs': {
    icon: '🔗',
    color: 'green',
    keyIdeas: [
      'a JOIN combines related rows from two or more tables',
      'INNER JOIN returns matching rows from both sides',
      'LEFT JOIN keeps all rows from the left table and adds matching right-side data when available',
      'the join condition links tables using related columns'
    ],
    sample: 'A SQL JOIN combines related rows across tables using a join condition. INNER JOIN keeps matching rows from both tables, while LEFT JOIN keeps every left-table row and adds matching right-side values when they exist.',
    challenge: 'What changes when a LEFT JOIN finds no matching row on the right?'
  }
};

function buildSystemPrompt(topic, keyIdeas) {
  return [
    'You are the AI student inside Teach-to-Learn AI, a conceptual-understanding assessment system.',
    `A college student is teaching you the topic: ${topic}.`,
    'Evaluate the explanation as evidence of understanding, not as a keyword-matching exercise.',
    'Judge correctness, completeness, coherence, and whether the student can communicate the concept in simple language.',
    'Prefer specific evidence from the explanation. Identify misconceptions only when a claim is actually incorrect.',
    'Use a supportive but rigorous tone appropriate for a college student.',
    '',
    'Reference concepts:',
    ...keyIdeas.map((idea, i) => `${i + 1}. ${idea}`),
    '',
    'Return JSON matching the provided schema. Score from 0 to 100.',
    'Use status=correct for strong understanding, partial when the core idea is present but important evidence is missing, and misconception when a major claim is incorrect or unreliable.',
    'Ask exactly one concise follow-up question when another probe would meaningfully test understanding; otherwise return an empty string.'
  ].join('\n');
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['correct', 'partial', 'misconception'] },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    coveredPoints: { type: 'array', items: { type: 'string' } },
    missingPoints: { type: 'array', items: { type: 'string' } },
    misconceptions: { type: 'array', items: { type: 'string' } },
    feedback: { type: 'string' },
    followUpQuestion: { type: 'string' }
  },
  required: ['status', 'score', 'coveredPoints', 'missingPoints', 'misconceptions', 'feedback', 'followUpQuestion']
};

function localFallback(topic, explanation) {
  const cfg = TOPICS[topic] || { keyIdeas: [] };
  const lower = explanation.toLowerCase();
  const covered = [];
  const missing = [];
  const misconceptions = [];

  const aliases = [
    ['1nf', 'first normal form'],
    ['partial dependency', 'part of a composite', 'depends on only part'],
    ['decomposition', 'split the table', 'splitting the relation'],
    ['composite key', 'composite primary key', 'whole key'],
    ['sorted', 'ordered data', 'sorted array'],
    ['middle element', 'middle'],
    ['half', 'halves', 'search space'],
    ['o(log n)', 'log n', 'logarithmic'],
    ['training data', 'training set'],
    ['test data', 'unseen data', 'validation'],
    ['too complex', 'complex model', 'noise'],
    ['regularization', 'more data', 'simpler model'],
    ['bfs', 'level by level', 'queue'],
    ['dfs', 'depth first', 'stack', 'recursion'],
    ['shortest path', 'unweighted graph'],
    ['big-o', 'growth', 'input size'],
    ['constant', 'constants', 'dominant term'],
    ['inner join', 'matching rows'],
    ['left join', 'all rows from the left'],
    ['join condition', 'related columns']
  ];

  for (const idea of cfg.keyIdeas) {
    const base = idea.toLowerCase();
    const words = base.split(/\s+/).filter(w => w.length > 4);
    let hit = lower.includes(base);
    if (!hit && words.length) {
      hit = words.filter(w => lower.includes(w)).length >= Math.max(1, Math.ceil(words.length * 0.4));
    }
    if (!hit) {
      const alias = aliases.find(group => group.some(x => base.includes(x) || x.includes(base.split(' ')[0])));
      if (alias) hit = alias.some(x => lower.includes(x));
    }
    (hit ? covered : missing).push(idea);
  }

  if (topic === 'Normalization (2NF)' && /2nf.*(does not|doesn't|no).*1nf/.test(lower)) {
    misconceptions.push('2NF assumes the relation is already in 1NF.');
  }
  if (topic === 'Binary Search' && lower.includes('unsorted')) {
    misconceptions.push('Standard binary search requires sorted or ordered data for the O(log n) guarantee.');
  }
  if (topic === 'Overfitting (ML)' && /overfitting.*(high|good).*test/.test(lower)) {
    misconceptions.push('Overfitting usually shows strong training performance but weaker performance on unseen data.');
  }
  if (topic === 'BFS vs DFS' && lower.includes('bfs') && lower.includes('stack') && !lower.includes('queue')) {
    misconceptions.push('BFS is conventionally implemented with a queue; DFS commonly uses a stack or recursion.');
  }
  if (topic === 'SQL JOINs' && lower.includes('left join') && lower.includes('only matching')) {
    misconceptions.push('A LEFT JOIN preserves all rows from the left table, even when the right side has no match.');
  }

  const wordCount = explanation.trim().split(/\s+/).filter(Boolean).length;
  const coverage = cfg.keyIdeas.length ? covered.length / cfg.keyIdeas.length : Math.min(1, wordCount / 50);
  let score = Math.round(Math.min(100, coverage * 78 + Math.min(1, wordCount / 70) * 12 + (misconceptions.length ? 0 : 10)));
  if (wordCount < 12) score = Math.min(score, 40);
  if (explanation.length < 55) score = Math.min(score, 58);

  let status = score >= 78 && misconceptions.length === 0 ? 'correct' : score >= 42 ? 'partial' : 'misconception';
  if (misconceptions.length >= 2) status = 'misconception';

  let followUpQuestion = '';
  if (missing.length) followUpQuestion = `Can you explain this with a simple example: ${missing[0]}?`;
  else if (misconceptions.length) followUpQuestion = 'What part of your explanation would you change after that correction?';
  else if (score < 92) followUpQuestion = cfg.challenge || 'Can you give one concrete example?';

  return {
    status,
    score,
    coveredPoints: covered,
    missingPoints: missing,
    misconceptions,
    feedback: status === 'correct'
      ? 'Strong teach-back. Your explanation shows the main concept and how the pieces connect.'
      : status === 'partial'
        ? 'Good start. The core idea is present, but a few important details are still missing.'
        : 'The explanation needs correction. Let us isolate the weak point and rebuild the concept step by step.',
    followUpQuestion
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY), model: MODEL });
});

app.get('/api/topics', (req, res) => {
  res.json(Object.entries(TOPICS).map(([name, value]) => ({ name, icon: value.icon, color: value.color })));
});

app.post('/api/evaluate', async (req, res) => {
  const { topic, explanation, followUpQuestion } = req.body || {};

  if (typeof topic !== 'string' || typeof explanation !== 'string' || !explanation.trim()) {
    return res.status(400).json({ error: 'Topic and explanation are required.' });
  }
  if (explanation.length > 12000) {
    return res.status(400).json({ error: 'Explanation is too long for this demo.' });
  }

  const cfg = TOPICS[topic] || { keyIdeas: [] };

  if (!process.env.OPENAI_API_KEY) {
    return res.json({ ...localFallback(topic, explanation), source: 'local-fallback' });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const studentInput = followUpQuestion
      ? `Previous AI-student follow-up question:\n${followUpQuestion}\n\nStudent's new answer:\n${explanation}`
      : `Student's explanation:\n${explanation}`;

    const response = await client.responses.create({
      model: MODEL,
      instructions: buildSystemPrompt(topic, cfg.keyIdeas),
      input: studentInput,
      text: {
        format: {
          type: 'json_schema',
          name: 'teach_back_evaluation',
          strict: true,
          schema
        }
      }
    });

    const result = JSON.parse(response.output_text);
    return res.json({ ...result, source: 'openai' });
  } catch (error) {
    console.error('OpenAI evaluation failed:', error.message);
    return res.json({
      ...localFallback(topic, explanation),
      source: 'local-fallback',
      warning: 'AI service was unavailable, so presentation-safe fallback evaluation was used.'
    });
  }
});

app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Teach-to-Learn AI running at http://localhost:${PORT}`);
});
