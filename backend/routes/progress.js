const express = require('express');
const { getProgress, getTermSummaries } = require('../services/progress');
const terms = require('../services/terms');

const router = express.Router();

// ?term_id=<id>  a specific semester
// ?term_id=all   everything, all years
// omitted        the semester currently in progress
router.get('/', async (req, res, next) => {
  try {
    const userId = req.userId;
    const goal = req.user.weekly_goal_minutes;

    await terms.ensureCurrent(userId, req.user.year_of_study);
    const current = await terms.getCurrent(userId);
    const termList = await terms.listTerms(userId);

    const requested = req.query.term_id;
    let scopeTerm = null;
    let allTime = false;

    if (requested === 'all') {
      allTime = true;
    } else if (requested) {
      scopeTerm = await terms.findTerm(requested, userId); // 400s if not theirs
    } else {
      scopeTerm = current;
    }

    // All-time always includes today; a single term only if it is the live one.
    const isLive = allTime || Number(scopeTerm?.id) === Number(current?.id);
    const data = await getProgress(userId, goal, allTime ? null : scopeTerm?.id, isLive);

    res.json({
      ...data,
      scope: {
        type: allTime ? 'all' : 'term',
        term: allTime ? null : scopeTerm,
        is_current: !allTime && Number(scopeTerm?.id) === Number(current?.id),
      },
      current_term: current,
      terms: await getTermSummaries(userId, goal, termList, current?.id),
      next_term: terms.nextAfter(current, req.user.semesters_per_year),
    });
  } catch (err) {
    if (err.field) return res.status(400).json({ error: err.message, field: err.field });
    next(err);
  }
});

module.exports = router;
