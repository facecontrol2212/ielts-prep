from enum import StrEnum


class Skill(StrEnum):
    LISTENING = "listening"
    READING = "reading"
    WRITING = "writing"
    SPEAKING = "speaking"


class Variant(StrEnum):
    ACADEMIC = "academic"
    GENERAL = "general"


class QuestionType(StrEnum):
    """Every question type the scoring engine must handle."""

    MULTIPLE_CHOICE = "multiple_choice"  # one correct option
    MULTIPLE_CHOICE_MULTI = "multiple_choice_multi"  # choose N of M
    TRUE_FALSE_NOT_GIVEN = "true_false_not_given"
    YES_NO_NOT_GIVEN = "yes_no_not_given"
    MATCHING_HEADINGS = "matching_headings"
    MATCHING_INFORMATION = "matching_information"
    MATCHING_FEATURES = "matching_features"
    MATCHING_SENTENCE_ENDINGS = "matching_sentence_endings"
    SENTENCE_COMPLETION = "sentence_completion"
    SUMMARY_COMPLETION = "summary_completion"
    NOTE_COMPLETION = "note_completion"
    TABLE_COMPLETION = "table_completion"
    FLOW_CHART_COMPLETION = "flow_chart_completion"
    FORM_COMPLETION = "form_completion"
    DIAGRAM_LABELLING = "diagram_labelling"
    MAP_LABELLING = "map_labelling"
    SHORT_ANSWER = "short_answer"


#: Types whose answer is free text and therefore goes through normalisation.
TEXT_ANSWER_TYPES: frozenset[QuestionType] = frozenset(
    {
        QuestionType.SENTENCE_COMPLETION,
        QuestionType.SUMMARY_COMPLETION,
        QuestionType.NOTE_COMPLETION,
        QuestionType.TABLE_COMPLETION,
        QuestionType.FLOW_CHART_COMPLETION,
        QuestionType.FORM_COMPLETION,
        QuestionType.SHORT_ANSWER,
        QuestionType.DIAGRAM_LABELLING,
        QuestionType.MAP_LABELLING,
    }
)

#: Types answered by picking a labelled option (A, B, C, i, ii, ...).
OPTION_ANSWER_TYPES: frozenset[QuestionType] = frozenset(
    {
        QuestionType.MULTIPLE_CHOICE,
        QuestionType.TRUE_FALSE_NOT_GIVEN,
        QuestionType.YES_NO_NOT_GIVEN,
        QuestionType.MATCHING_HEADINGS,
        QuestionType.MATCHING_INFORMATION,
        QuestionType.MATCHING_FEATURES,
        QuestionType.MATCHING_SENTENCE_ENDINGS,
    }
)


class MatchMode(StrEnum):
    """How an answer key is compared against the student's answer."""

    NORMALISED = "normalised"  # full normalisation pipeline (default for text)
    EXACT = "exact"  # byte-equal after trim/case-fold only
    OPTION = "option"  # single option label
    OPTION_SET = "option_set"  # unordered set of option labels


class AttemptStatus(StrEnum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    SCORED = "scored"
    ABANDONED = "abandoned"
    EXPIRED = "expired"


class Locale(StrEnum):
    UZ = "uz"
    EN = "en"
    RU = "ru"


class SpeakingPart(StrEnum):
    PART_1 = "part_1"
    PART_2 = "part_2"
    PART_3 = "part_3"
