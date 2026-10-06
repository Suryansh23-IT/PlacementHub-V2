# M8 analytics contract

## Authoritative cohort

The college cohort is every StudentProfile in the selected academic filters. College placement eligibility is evaluated once from the InstitutionProfile rule: verified profile, minimum CGPA, maximum active backlogs, and (when configured) graduation year. It is separate from a PlacementDrive's eligibility.

`Eligible placement rate = unique college-eligible students with a confirmed placement outcome / college-eligible students.` `Whole batch placement rate` uses all students as its denominator. `full_time`, `ppo`, `internship_and_ppo`, and plain `internship` are placement-equivalent after Admin confirmation; rejected, revoked, and unconfirmed outcomes are not. Offers count confirmed records, so offers may exceed unique placed students.

## Packages and dates

Package statistics use only confirmed records with a positive INR per-annum CTC. Highest, median, average, and lowest are null when no valid package exists; stipend is separate. Placement dates use `adminVerifiedAt`; application dates use `appliedAt`; published-drive dates use `publishedAt`; phase activity uses phase/history timestamps; revocation uses its history timestamp.

## Shared filters and scopes

The reusable filter vocabulary is batch/graduationYear, dateFrom/dateTo, branch, company, drive, minCpi/maxCpi, collegeEligibility, placementStatus, outcomeType, verificationStatus, search, sortBy/sortOrder, groupBy, page, and limit. APIs validate and authorize each filter server-side. Admin sees institution data; Company sees only its company, drives, and candidates; Student sees only their own data.

## Parity and stage boundaries

Every dashboard, explorer, report, and export calls the same domain query semantics. A filtered export must contain the same identities as the matching UI result. M8A owns the contract, cohort-rule configuration, validated filters, and Admin summary API. M8B owns the Admin command center; M8C Student Explorer; M8D Company analytics; M8E reports/Excel; M8F notification intelligence; M8G integration and scale QA.
