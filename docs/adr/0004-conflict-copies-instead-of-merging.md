# Sync conflicts create a Conflict Copy instead of merging or overwriting

When GitHub rejects a push because the same note changed elsewhere, Glacier keeps both versions. The incoming one is saved as a Conflict Copy titled "\<Title\> (conflict \<YYYY-MM-DD\>)", and the user merges them by hand. Last-write-wins would silently discard an edit, and real three-way merging is far too complex for this project. Conflicts are expected to be rare (one user, rarely editing the same note in two browsers at once), so an occasional visible duplicate is an acceptable price for never losing text.
