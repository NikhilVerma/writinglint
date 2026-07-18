"""Compact transformer encoder with UPOS and deep-biaffine parser heads."""

from __future__ import annotations

from dataclasses import dataclass
import math

import torch
from torch import nn
from transformers import AutoModel


class MLP(nn.Module):
    def __init__(self, input_size: int, output_size: int, dropout: float) -> None:
        super().__init__()
        self.linear = nn.Linear(input_size, output_size)
        self.activation = nn.GELU()
        self.dropout = nn.Dropout(dropout)

    def forward(self, values: torch.Tensor) -> torch.Tensor:
        return self.dropout(self.activation(self.linear(values)))


class Biaffine(nn.Module):
    def __init__(self, size: int, outputs: int = 1, scale_scores: bool = False) -> None:
        super().__init__()
        self.weight = nn.Parameter(torch.empty(outputs, size + 1, size + 1))
        nn.init.xavier_uniform_(self.weight)
        self.scale = math.sqrt(size) if scale_scores else 1.0

    def forward(self, dependent: torch.Tensor, head: torch.Tensor) -> torch.Tensor:
        dependent = torch.cat([dependent, torch.ones_like(dependent[..., :1])], dim=-1)
        head = torch.cat([head, torch.ones_like(head[..., :1])], dim=-1)
        # [batch, dependent, head, output]
        return torch.einsum("bxi,oij,byj->bxyo", dependent, self.weight, head) / self.scale


@dataclass
class ParserOutput:
    upos_logits: torch.Tensor
    arc_logits: torch.Tensor
    relation_logits: torch.Tensor | None
    relation_dependent: torch.Tensor
    relation_heads: torch.Tensor


class CompactDependencyParser(nn.Module):
    def __init__(
        self,
        encoder_name: str,
        upos_count: int,
        relation_count: int,
        arc_size: int = 256,
        relation_size: int = 128,
        dropout: float = 0.2,
        scale_biaffine: bool = False,
    ) -> None:
        super().__init__()
        self.encoder_name = encoder_name
        # Some hubs publish FP16 weights. Keep trainable master weights in FP32;
        # the training loop applies BF16 autocast independently on supported GPUs.
        self.encoder = AutoModel.from_pretrained(encoder_name, dtype=torch.float32)
        hidden = self.encoder.config.hidden_size
        self.root = nn.Parameter(torch.empty(hidden))
        nn.init.normal_(self.root, std=0.02)
        self.upos = nn.Sequential(nn.Dropout(dropout), nn.Linear(hidden, upos_count))
        self.arc_dependent = MLP(hidden, arc_size, dropout)
        self.arc_head = MLP(hidden, arc_size, dropout)
        self.relation_dependent = MLP(hidden, relation_size, dropout)
        self.relation_head = MLP(hidden, relation_size, dropout)
        self.arc_biaffine = Biaffine(arc_size, scale_scores=scale_biaffine)
        self.relation_biaffine = Biaffine(relation_size, relation_count, scale_scores=scale_biaffine)

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor,
        word_starts: torch.Tensor,
        word_mask: torch.Tensor,
        selected_heads: torch.Tensor | None = None,
    ) -> ParserOutput:
        encoded = self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        gather = word_starts.unsqueeze(-1).expand(-1, -1, encoded.shape[-1])
        words = encoded.gather(1, gather)
        root = self.root.view(1, 1, -1).expand(words.shape[0], -1, -1)
        heads = torch.cat([root, words], dim=1)

        upos_logits = self.upos(words)
        arc_logits = self.arc_biaffine(self.arc_dependent(words), self.arc_head(heads)).squeeze(-1)
        relation_dependent = self.relation_dependent(words)
        relation_heads = self.relation_head(heads)
        relation_logits = (
            self.score_relations(relation_dependent, relation_heads, selected_heads)
            if selected_heads is not None
            else None
        )

        # Mask padded candidate heads and self loops. Root is always candidate 0.
        head_mask = torch.cat(
            [torch.ones(word_mask.shape[0], 1, dtype=torch.bool, device=word_mask.device), word_mask],
            dim=1,
        )
        arc_logits = arc_logits.masked_fill(~head_mask.unsqueeze(1), torch.finfo(arc_logits.dtype).min)
        positions = torch.arange(word_mask.shape[1], device=word_mask.device)
        arc_logits[:, positions, positions + 1] = torch.finfo(arc_logits.dtype).min
        return ParserOutput(upos_logits, arc_logits, relation_logits, relation_dependent, relation_heads)

    def score_relations(
        self,
        dependent: torch.Tensor,
        heads: torch.Tensor,
        selected_heads: torch.Tensor,
    ) -> torch.Tensor:
        gather = selected_heads.clamp_min(0).unsqueeze(-1).expand(-1, -1, heads.shape[-1])
        selected = heads.gather(1, gather)
        dependent = torch.cat([dependent, torch.ones_like(dependent[..., :1])], dim=-1)
        selected = torch.cat([selected, torch.ones_like(selected[..., :1])], dim=-1)
        return torch.einsum("bxi,oij,bxj->bxo", dependent, self.relation_biaffine.weight, selected) / self.relation_biaffine.scale
