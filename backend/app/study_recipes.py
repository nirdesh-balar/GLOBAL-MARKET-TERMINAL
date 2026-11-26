"""Bounded, versioned indicator recipes. Fields select existing numeric functions."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .indicators import rolling, rsi, smooth, source


class StudyRecipe(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, allow_inf_nan=False)
    version: Literal[1] = 1
    source: Literal['close', 'open', 'high', 'low', 'HL2', 'HLC3', 'OHLC4'] = 'close'
    rsi: int = Field(default=9, ge=2, le=200)
    ema: int = Field(default=3, ge=2, le=200)
    wma: int = Field(default=21, ge=2, le=200)


class StudyRule(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, allow_inf_nan=False)
    recipe: StudyRecipe
    output: Literal['rsi', 'ema', 'wma'] = 'rsi'
    direction: Literal['above', 'below'] = 'above'
    level: float = Field(default=50, ge=0, le=100)


class StudyRevision(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    number: int = Field(ge=1)
    recipe: StudyRecipe
    output: Literal['rsi', 'ema', 'wma'] = 'rsi'
    direction: Literal['above', 'below'] = 'above'
    level: float = Field(default=50, ge=0, le=100, allow_inf_nan=False)


class LocalStudy(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(pattern=r'^[0-9a-f-]{36}$')
    name: str = Field(min_length=1, max_length=64)
    category: Literal['indicator', 'rule', 'library']
    revisions: list[StudyRevision] = Field(min_length=1, max_length=5)

    @model_validator(mode='after')
    def increasing_revisions(self):
        numbers = [item.number for item in self.revisions]
        if numbers != sorted(set(numbers)):
            raise ValueError('Study revisions must increase')
        return self


def evaluate_study_rule(rule, rows):
    """Return a nullable crossing on the last two supplied candles."""
    values = rsi(source(rows, rule.recipe.source), rule.recipe.rsi)
    if rule.output == 'ema':
        values = smooth(values, rule.recipe.ema)
    elif rule.output == 'wma':
        values = rolling(values, rule.recipe.wma, True)
    if len(values) < 2 or values[-1] is None or values[-2] is None:
        return None, values[-1] if values else None
    before, last = values[-2:]
    matched = before <= rule.level < last if rule.direction == 'above' else before >= rule.level > last
    return matched, last
