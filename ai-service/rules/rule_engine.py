"""
Generic rule engine.

Holds an ordered list of rules and evaluates them against a context, returning
every rule that fired. It knows nothing about motion specifically — future
detectors register their own rules here and the engine is unchanged.
"""

from __future__ import annotations

from rules.base_rule import BaseRule, RuleContext, RuleResult
from utils.logger import get_logger

log = get_logger("rules")


class RuleEngine:
    def __init__(self) -> None:
        self._rules: list[BaseRule] = []

    def register(self, rule: BaseRule) -> "RuleEngine":
        self._rules.append(rule)
        log.debug("Registered rule: %s", rule.name)
        return self

    @property
    def rules(self) -> list[BaseRule]:
        return list(self._rules)

    def evaluate(self, ctx: RuleContext) -> list[RuleResult]:
        """Evaluate all rules; return the results of those that fired."""
        fired: list[RuleResult] = []
        for rule in self._rules:
            try:
                result = rule.evaluate(ctx)
                if result is not None:
                    fired.append(result)
            except Exception as exc:  # a faulty rule must never break the loop
                log.exception("Rule '%s' raised an error: %s", rule.name, exc)
        return fired
