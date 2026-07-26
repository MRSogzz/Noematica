---
uid: ""                        # 唯一識別碼，如 rate_affects_bank_profit
from: ""                       # 指向 Entity uid
to: ""                         # 指向 Entity uid
type: ""                       # causal | correlation | definition | constraint | heuristic | analogy
abstraction:
  level: 1                     # 1（具體機制）～5（高度抽象/隱喻）
  jump_allowed: false          # 是否允許跨層級直接引用/推論
status: active                 # active | dormant | deprecated | archived
lifecycle:
  status: active
  last_review: ""              # YYYY-MM-DD，人類最後審查日期
lineage:
  type: ""                     # refinement | replacement | split | merge | branch （若為根節點留空）
  parents: []                  # 父 Atom uid 列表
  inherit_rules: []            # 自由文字，描述繼承了父節點的哪些假設/限制
domains: []                    # 通常繼承自 from/to 的 domains，可手動覆寫
created: ""                    # YYYY-MM-DD
---

## 機制說明

（用一到兩句話描述 from -> to 之間「為什麼」會有這個關係。這是骨架，永不因新觀測而改寫；
若機制本身被推翻，應該建立新 Atom 並用 lineage.type = replacement 指回本節點，而不是原地修改。）

## 已知限制 / 適用邊界

（此關係在什麼條件下不成立？例如流動性枯竭、政策機制失效等。）
