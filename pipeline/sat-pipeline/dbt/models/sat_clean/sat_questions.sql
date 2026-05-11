{{
  config(
    materialized = 'table',
    unique_key   = 'question_id'
  )
}}

with raw as (
    select *
    from {{ source('sat_raw', 'sat_questions_raw') }}
),

deduped as (
    select
        question_id,
        source,
        source_url,
        case
            when lower(section) like '%math%'                                   then 'Math'
            when lower(section) like '%read%' or lower(section) like '%writ%'   then 'Reading & Writing'
            else trim(section)
        end                         as section,
        trim(domain)                as domain,
        case
            when lower(difficulty) like '%easy%'    then 'Easy'
            when lower(difficulty) like '%medium%'  then 'Medium'
            when lower(difficulty) like '%hard%'    then 'Hard'
            else null
        end                         as difficulty,
        trim(question_text)         as question_text,
        choices,
        trim(correct_answer)        as correct_answer,
        nullif(trim(coalesce(explanation, '')), '') as explanation,
        scraped_at,
        row_number() over (
            partition by question_id
            order by scraped_at desc
        )                           as rn
    from raw
    where trim(question_text) != ''
      and trim(correct_answer) != ''
)

select
    question_id,
    source,
    source_url,
    section,
    domain,
    difficulty,
    question_text,
    choices,
    correct_answer,
    explanation,
    scraped_at
from deduped
where rn = 1
