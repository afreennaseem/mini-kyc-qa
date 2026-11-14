# Eval results

| Run | Mode | Model | Accuracy | Hard-invariant failures | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | mock | — | 100% | 0 | Baseline, rules in code |
| 2 | llm | — | pending | — | LLM mode implemented; real-model run pending API access |

Mutation check: removing the "PEP only raises low risk" guard made critical case H3 (PEP in Iran) return medium.
Accuracy stayed at 91.7% (above the 90% threshold), but the critical-case check failed it.
A threshold alone would have let this compliance bug through