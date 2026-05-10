{{
  config(
    materialized = 'table',
    engine       = 'MergeTree()',
    order_by     = '(source, question_id)',
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
        -- Normalise section names
        case
            when lower(section) like '%math%' then 'Math'
            when lower(section) like '%read%' or lower(section) like '%writ%'
                then 'Reading & Writing'
            else trim(section)
        end as section,
        trim(domain)           as domain,
        -- Normalise difficulty
        case
            when lower(difficulty) like '%easy%'   then 'Easy'
            when lower(difficulty) like '%medium%' then 'Medium'
            when lower(difficulty) like '%hard%'   then 'Hard'
            else null
        end as difficulty,
        trim(question_text)    as question_text,
        choices,
        trim(correct_answer)   as correct_answer,
        nullif(trim(explanation), '') as explanation,
        scraped_at,
        -- Keep only the latest scrape per question
        row_number() over (
            partition by question_id
            order by scraped_at desc
        ) as rn
    from raw
    where question_text != ''
      and correct_answer != ''
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
