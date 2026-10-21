# #95 native Linux repetition tables

One row per popup observation: `rep` is the Playwright repetition index, `obs` 1 is the HTML popup and 2 the SVG popup. Times are milliseconds after `click.start`; `install` is the observer collector install acknowledgement (`skip` in the pre-change variant, which removes it); `first`/`last` are the collector state at the first and last poll. Generated from the trace files next to this one.

## linux-prechange-20

| rep | obs | paused | attached | install | resume | response | page | context | posted | polls | first    | last     |
| --- | --- | ------ | -------- | ------- | ------ | -------- | ---- | ------- | ------ | ----- | -------- | -------- |
| 0   | 1   | True   | 49       | skip    | 78     | 93       | 73   | 73      | 140    | 1     | 1 events | 1 events |
| 0   | 2   | True   | 37       | skip    | 67     | 85       | 62   | 62      | 91     | 1     | 1 events | 1 events |
| 1   | 1   | True   | 65       | skip    | 89     | 102      | 83   | 84      | 138    | 1     | 1 events | 1 events |
| 1   | 2   | True   | 49       | skip    | 76     | 91       | 70   | 71      | 98     | 1     | 1 events | 1 events |
| 2   | 1   | True   | 56       | skip    | 77     | 93       | 74   | 74      | 137    | 1     | 1 events | 1 events |
| 2   | 2   | True   | 52       | skip    | 77     | 96       | 73   | 73      | 103    | 1     | 1 events | 1 events |
| 3   | 1   | True   | 57       | skip    | 81     | 98       | 75   | 76      | 132    | 1     | 1 events | 1 events |
| 3   | 2   | True   | 35       | skip    | 66     | 82       | 59   | 58      | 102    | 1     | 1 events | 1 events |
| 4   | 1   | True   | 53       | skip    | 80     | 97       | 75   | 75      | 134    | 1     | 1 events | 1 events |
| 4   | 2   | True   | 51       | skip    | 80     | 102      | 73   | 75      | 107    | 1     | 1 events | 1 events |
| 5   | 1   | True   | 57       | skip    | 84     | 101      | 78   | 79      | 148    | 1     | 1 events | 1 events |
| 5   | 2   | True   | 46       | skip    | 74     | 88       | 69   | 69      | 94     | 1     | 1 events | 1 events |
| 6   | 1   | True   | 52       | skip    | 77     | 96       | 72   | 73      | 130    | 1     | 1 events | 1 events |
| 6   | 2   | True   | 72       | skip    | 103    | 125      | 100  | 100     | 132    | 1     | 1 events | 1 events |
| 7   | 1   | True   | 83       | skip    | 124    | 148      | 119  | 120     | 200    | 1     | 1 events | 1 events |
| 7   | 2   | True   | 61       | skip    | 98     | 121      | 89   | 89      | 128    | 1     | 1 events | 1 events |
| 8   | 1   | True   | 59       | skip    | 86     | 104      | 81   | 81      | 153    | 1     | 1 events | 1 events |
| 8   | 2   | True   | 38       | skip    | 64     | 79       | 61   | 61      | 87     | 1     | 1 events | 1 events |
| 9   | 1   | True   | 55       | skip    | 84     | 102      | 79   | 80      | 157    | 1     | 1 events | 1 events |
| 9   | 2   | True   | 38       | skip    | 69     | 90       | 61   | 61      | 109    | 1     | 1 events | 1 events |
| 10  | 1   | True   | 50       | skip    | 81     | 98       | 76   | 78      | 149    | 1     | 1 events | 1 events |
| 10  | 2   | True   | 52       | skip    | 84     | 103      | 76   | 78      | 110    | 1     | 1 events | 1 events |
| 11  | 1   | True   | 66       | skip    | 96     | 112      | 90   | 91      | 157    | 1     | 1 events | 1 events |
| 11  | 2   | True   | 51       | skip    | 84     | 107      | 76   | 77      | 112    | 1     | 1 events | 1 events |
| 12  | 1   | True   | 53       | skip    | 79     | 98       | 74   | 75      | 143    | 1     | 1 events | 1 events |
| 12  | 2   | True   | 48       | skip    | 79     | 98       | 71   | 74      | 118    | 1     | 1 events | 1 events |
| 13  | 1   | True   | 63       | skip    | 91     | 113      | 85   | 86      | 164    | 1     | 1 events | 1 events |
| 13  | 2   | True   | 37       | skip    | 70     | 91       | 63   | 65      | 114    | 1     | 1 events | 1 events |
| 14  | 1   | True   | 56       | skip    | 84     | 102      | 79   | 79      | 139    | 1     | 1 events | 1 events |
| 14  | 2   | True   | 40       | skip    | 76     | 93       | 66   | 68      | 101    | 1     | 1 events | 1 events |
| 16  | 1   | True   | 53       | skip    | 81     | 98       | 76   | 77      | 133    | 1     | 1 events | 1 events |
| 16  | 2   | True   | 46       | skip    | 78     | 101      | 71   | 72      | 123    | 1     | 1 events | 1 events |
| 17  | 1   | True   | 63       | skip    | 93     | 109      | 85   | 87      | 144    | 1     | 1 events | 1 events |
| 17  | 2   | True   | 46       | skip    | 80     | 99       | 73   | 75      | 105    | 1     | 1 events | 1 events |
| 19  | 1   | True   | 60       | skip    | 86     | 106      | 80   | 83      | 157    | 1     | 1 events | 1 events |
| 19  | 2   | True   | 39       | skip    | 67     | 82       | 61   | 61      | 88     | 1     | 1 events | 1 events |

## linux-prechange-10a

| rep | obs | paused | attached | install | resume | response | page | context | posted | polls | first    | last     |
| --- | --- | ------ | -------- | ------- | ------ | -------- | ---- | ------- | ------ | ----- | -------- | -------- |
| 0   | 1   | True   | 61       | skip    | 109    | 127      | 91   | 101     | 178    | 1     | 1 events | 1 events |
| 0   | 2   | True   | 49       | skip    | 82     | 99       | 71   | 71      | 104    | 1     | 1 events | 1 events |
| 1   | 1   | True   | 63       | skip    | 91     | 106      | 85   | 86      | 139    | 1     | 1 events | 1 events |
| 1   | 2   | True   | 40       | skip    | 69     | 91       | 62   | 63      | 96     | 1     | 1 events | 1 events |
| 2   | 1   | True   | 58       | skip    | 87     | 102      | 82   | 83      | 149    | 1     | 1 events | 1 events |
| 2   | 2   | True   | 37       | skip    | 67     | 89       | 62   | 62      | 109    | 1     | 1 events | 1 events |
| 3   | 1   | True   | 56       | skip    | 82     | 98       | 75   | 76      | 136    | 1     | 1 events | 1 events |
| 3   | 2   | True   | 35       | skip    | 69     | 86       | 62   | 62      | 105    | 1     | 1 events | 1 events |
| 4   | 1   | True   | 58       | skip    | 83     | 101      | 78   | 79      | 137    | 1     | 1 events | 1 events |
| 4   | 2   | True   | 55       | skip    | 88     | 107      | 81   | 82      | 126    | 1     | 1 events | 1 events |
| 5   | 1   | True   | 55       | skip    | 80     | 97       | 76   | 76      | 134    | 1     | 1 events | 1 events |
| 5   | 2   | True   | 33       | skip    | 68     | 89       | 61   | 63      | 94     | 1     | 1 events | 1 events |
| 6   | 1   | True   | 60       | skip    | 94     | 111      | 88   | 90      | 148    | 1     | 1 events | 1 events |
| 6   | 2   | True   | 40       | skip    | 73     | 88       | 65   | 67      | 96     | 1     | 1 events | 1 events |
| 7   | 1   | True   | 55       | skip    | 84     | 101      | 77   | 77      | 135    | 1     | 1 events | 1 events |
| 7   | 2   | True   | 50       | skip    | 88     | 104      | 77   | 78      | 109    | 1     | 1 events | 1 events |
| 8   | 1   | True   | 50       | skip    | 79     | 96       | 75   | 75      | 147    | 1     | 1 events | 1 events |
| 8   | 2   | True   | 46       | skip    | 75     | 93       | 70   | 70      | 99     | 1     | 1 events | 1 events |
| 9   | 1   | True   | 56       | skip    | 83     | 96       | 76   | 76      | 133    | 1     | 1 events | 1 events |
| 9   | 2   | True   | 49       | skip    | 79     | 96       | 73   | 73      | 120    | 1     | 1 events | 1 events |

## linux-prechange-10b

| rep | obs | paused | attached | install | resume | response | page | context | posted | polls | first    | last     |
| --- | --- | ------ | -------- | ------- | ------ | -------- | ---- | ------- | ------ | ----- | -------- | -------- |
| 0   | 1   | True   | 61       | skip    | 86     | 103      | 81   | 81      | 138    | 1     | 1 events | 1 events |
| 0   | 2   | True   | 35       | skip    | 69     | 95       | 62   | 62      | 101    | 1     | 1 events | 1 events |
| 1   | 1   | True   | 54       | skip    | 80     | 96       | 74   | 75      | 129    | 1     | 1 events | 1 events |
| 1   | 2   | True   | 34       | skip    | 65     | 84       | 59   | 60      | 102    | 1     | 1 events | 1 events |
| 2   | 1   | True   | 60       | skip    | 86     | 100      | 80   | 81      | 137    | 1     | 1 events | 1 events |
| 2   | 2   | True   | 56       | skip    | 85     | 103      | 79   | 80      | 109    | 1     | 1 events | 1 events |
| 3   | 1   | True   | 55       | skip    | 84     | 98       | 76   | 77      | 131    | 1     | 1 events | 1 events |
| 3   | 2   | True   | 37       | skip    | 73     | 96       | 64   | 65      | 116    | 1     | 1 events | 1 events |
| 4   | 1   | True   | 58       | skip    | 85     | 100      | 79   | 79      | 138    | 1     | 1 events | 1 events |
| 4   | 2   | True   | 36       | skip    | 73     | 91       | 64   | 65      | 113    | 1     | 1 events | 1 events |
| 5   | 1   | True   | 64       | skip    | 91     | 109      | 85   | 87      | 145    | 1     | 1 events | 1 events |
| 5   | 2   | True   | 48       | skip    | 77     | 96       | 73   | 74      | 117    | 1     | 1 events | 1 events |
| 6   | 1   | True   | 65       | skip    | 94     | 114      | 88   | 90      | 162    | 1     | 1 events | 1 events |
| 6   | 2   | True   | 47       | skip    | 81     | 101      | 70   | 72      | 108    | 1     | 1 events | 1 events |
| 7   | 1   | True   | 66       | skip    | 91     | 113      | 86   | 86      | 165    | 1     | 1 events | 1 events |
| 7   | 2   | True   | 48       | skip    | 91     | 104      | 77   | 79      | 110    | 1     | 1 events | 1 events |
| 8   | 1   | True   | 54       | skip    | 81     | 99       | 75   | 76      | 134    | 1     | 1 events | 1 events |
| 8   | 2   | True   | 47       | skip    | 78     | 98       | 73   | 73      | 119    | 1     | 1 events | 1 events |
| 9   | 1   | True   | 55       | skip    | 85     | 103      | 80   | 81      | 159    | 1     | 1 events | 1 events |
| 9   | 2   | True   | 35       | skip    | 69     | 92       | 63   | 65      | 115    | 1     | 1 events | 1 events |

## linux-postchange-20

| rep | obs | paused | attached | install | resume | response | page | context | posted | polls | first    | last     |
| --- | --- | ------ | -------- | ------- | ------ | -------- | ---- | ------- | ------ | ----- | -------- | -------- |
| 0   | 1   | True   | 68       | 95      | 98     | 115      | 89   | 90      | 152    | 1     | 1 events | 1 events |
| 0   | 2   | True   | 35       | 62      | 65     | 88       | 57   | 59      | 109    | 1     | 1 events | 1 events |
| 1   | 1   | True   | 61       | 91      | 93     | 112      | 87   | 88      | 150    | 1     | 1 events | 1 events |
| 1   | 2   | True   | 38       | 66      | 69     | 89       | 62   | 63      | 112    | 1     | 1 events | 1 events |
| 2   | 1   | True   | 66       | 94      | 100    | 114      | 91   | 91      | 153    | 1     | 1 events | 1 events |
| 2   | 2   | True   | 52       | 77      | 79     | 104      | 73   | 73      | 125    | 1     | 1 events | 1 events |
| 3   | 1   | True   | 57       | 78      | 81     | 99       | 74   | 75      | 134    | 1     | 1 events | 1 events |
| 3   | 2   | True   | 37       | 68      | 71     | 88       | 63   | 64      | 109    | 1     | 1 events | 1 events |
| 4   | 1   | True   | 60       | 85      | 89     | 103      | 80   | 80      | 143    | 1     | 1 events | 1 events |
| 4   | 2   | True   | 35       | 67      | 69     | 89       | 62   | 62      | 112    | 1     | 1 events | 1 events |
| 5   | 1   | True   | 46       | 76      | 78     | 99       | 71   | 71      | 137    | 1     | 1 events | 1 events |
| 5   | 2   | True   | 49       | 81      | 85     | 100      | 75   | 77      | 107    | 1     | 1 events | 1 events |
| 6   | 1   | True   | 53       | 79      | 82     | 97       | 74   | 75      | 150    | 1     | 1 events | 1 events |
| 6   | 2   | True   | 52       | 83      | 87     | 109      | 77   | 78      | 115    | 1     | 1 events | 1 events |
| 7   | 1   | True   | 64       | 90      | 93     | 114      | 87   | 88      | 156    | 1     | 1 events | 1 events |
| 7   | 2   | True   | 51       | 78      | 81     | 102      | 74   | 75      | 107    | 1     | 1 events | 1 events |
| 8   | 1   | True   | 59       | 88      | 92     | 109      | 83   | 84      | 150    | 1     | 1 events | 1 events |
| 8   | 2   | True   | 34       | 65      | 68     | 86       | 60   | 61      | 107    | 1     | 1 events | 1 events |
| 9   | 1   | True   | 61       | 85      | 88     | 104      | 81   | 81      | 143    | 1     | 1 events | 1 events |
| 9   | 2   | True   | 37       | 70      | 75     | 92       | 64   | 66      | 97     | 1     | 1 events | 1 events |
| 10  | 1   | True   | 60       | 85      | 87     | 104      | 81   | 81      | 141    | 1     | 1 events | 1 events |
| 10  | 2   | True   | 50       | 85      | 90     | 107      | 79   | 80      | 113    | 1     | 1 events | 1 events |
| 11  | 1   | True   | 51       | 76      | 79     | 98       | 72   | 72      | 142    | 1     | 1 events | 1 events |
| 11  | 2   | True   | 45       | 77      | 80     | 102      | 70   | 71      | 122    | 1     | 1 events | 1 events |
| 12  | 1   | True   | 61       | 84      | 87     | 102      | 80   | 80      | 142    | 1     | 1 events | 1 events |
| 12  | 2   | True   | 34       | 68      | 72     | 92       | 61   | 61      | 99     | 1     | 1 events | 1 events |
| 13  | 1   | True   | 59       | 85      | 89     | 105      | 81   | 81      | 146    | 1     | 1 events | 1 events |
| 13  | 2   | True   | 38       | 70      | 74     | 95       | 64   | 65      | 100    | 1     | 1 events | 1 events |
| 14  | 1   | True   | 63       | 92      | 95     | 114      | 88   | 89      | 154    | 1     | 1 events | 1 events |
| 14  | 2   | True   | 53       | 82      | 86     | 106      | 78   | 79      | 113    | 1     | 1 events | 1 events |
| 16  | 1   | True   | 66       | 92      | 96     | 114      | 88   | 89      | 166    | 1     | 1 events | 1 events |
| 16  | 2   | True   | 45       | 84      | 91     | 121      | 70   | 73      | 145    | 1     | 1 events | 1 events |
| 17  | 1   | True   | 66       | 93      | 96     | 113      | 88   | 89      | 156    | 1     | 1 events | 1 events |
| 17  | 2   | True   | 46       | 82      | 86     | 103      | 75   | 76      | 110    | 1     | 1 events | 1 events |
| 19  | 1   | True   | 62       | 84      | 87     | 104      | 80   | 81      | 140    | 1     | 1 events | 1 events |
| 19  | 2   | True   | 38       | 68      | 70     | 89       | 65   | 60      | 94     | 1     | 1 events | 1 events |

## linux-postchange-10a

| rep | obs | paused | attached | install | resume | response | page | context | posted | polls | first    | last     |
| --- | --- | ------ | -------- | ------- | ------ | -------- | ---- | ------- | ------ | ----- | -------- | -------- |
| 0   | 1   | True   | 70       | 93      | 98     | 120      | 90   | 91      | 163    | 1     | 1 events | 1 events |
| 0   | 2   | True   | 53       | 87      | 93     | 107      | 82   | 83      | 126    | 1     | 1 events | 1 events |
| 1   | 1   | True   | 56       | 84      | 89     | 102      | 79   | 80      | 138    | 1     | 1 events | 1 events |
| 1   | 2   | True   | 60       | 90      | 93     | 113      | 85   | 87      | 134    | 1     | 1 events | 1 events |
| 2   | 1   | True   | 58       | 81      | 84     | 100      | 78   | 79      | 135    | 1     | 1 events | 1 events |
| 2   | 2   | True   | 47       | 78      | 84     | 99       | 73   | 73      | 118    | 1     | 1 events | 1 events |
| 3   | 1   | True   | 56       | 80      | 82     | 97       | 76   | 76      | 140    | 1     | 1 events | 1 events |
| 3   | 2   | True   | 50       | 83      | 89     | 103      | 77   | 78      | 125    | 1     | 1 events | 1 events |
| 4   | 1   | True   | 55       | 79      | 81     | 97       | 75   | 76      | 150    | 1     | 1 events | 1 events |
| 4   | 2   | True   | 46       | 76      | 78     | 98       | 70   | 70      | 103    | 1     | 1 events | 1 events |
| 5   | 1   | True   | 53       | 80      | 83     | 102      | 76   | 76      | 142    | 1     | 1 events | 1 events |
| 5   | 2   | True   | 47       | 79      | 86     | 105      | 71   | 72      | 113    | 1     | 1 events | 1 events |
| 6   | 1   | True   | 59       | 85      | 88     | 104      | 81   | 82      | 144    | 1     | 1 events | 1 events |
| 6   | 2   | True   | 36       | 66      | 69     | 88       | 61   | 62      | 94     | 1     | 1 events | 1 events |
| 7   | 1   | True   | 52       | 78      | 80     | 100      | 73   | 74      | 144    | 1     | 1 events | 1 events |
| 7   | 2   | True   | 35       | 67      | 70     | 91       | 61   | 61      | 112    | 1     | 1 events | 1 events |
| 8   | 1   | True   | 61       | 85      | 89     | 108      | 83   | 80      | 146    | 1     | 1 events | 1 events |
| 8   | 2   | True   | 52       | 82      | 84     | 106      | 78   | 79      | 126    | 1     | 1 events | 1 events |
| 9   | 1   | True   | 66       | 90      | 92     | 110      | 86   | 86      | 147    | 1     | 1 events | 1 events |
| 9   | 2   | True   | 49       | 77      | 80     | 98       | 70   | 72      | 105    | 1     | 1 events | 1 events |

## linux-postchange-10b

| rep | obs | paused | attached | install | resume | response | page | context | posted | polls | first    | last     |
| --- | --- | ------ | -------- | ------- | ------ | -------- | ---- | ------- | ------ | ----- | -------- | -------- |
| 0   | 1   | True   | 67       | 121     | 125    | 138      | 99   | 103     | 190    | 1     | 1 events | 1 events |
| 0   | 2   | True   | 42       | 69      | 72     | 102      | 65   | 66      | 123    | 1     | 1 events | 1 events |
| 1   | 1   | True   | 58       | 88      | 92     | 106      | 83   | 85      | 149    | 1     | 1 events | 1 events |
| 1   | 2   | True   | 35       | 63      | 67     | 86       | 58   | 59      | 92     | 1     | 1 events | 1 events |
| 2   | 1   | True   | 59       | 84      | 88     | 110      | 81   | 81      | 142    | 1     | 1 events | 1 events |
| 2   | 2   | True   | 35       | 67      | 70     | 90       | 63   | 63      | 95     | 1     | 1 events | 1 events |
| 3   | 1   | True   | 63       | 86      | 89     | 106      | 82   | 83      | 144    | 1     | 1 events | 1 events |
| 3   | 2   | True   | 39       | 68      | 70     | 90       | 63   | 63      | 110    | 1     | 1 events | 1 events |
| 4   | 1   | True   | 61       | 86      | 88     | 103      | 81   | 82      | 139    | 1     | 1 events | 1 events |
| 4   | 2   | True   | 50       | 75      | 77     | 95       | 71   | 71      | 100    | 1     | 1 events | 1 events |
| 5   | 1   | True   | 54       | 79      | 82     | 102      | 76   | 76      | 134    | 1     | 1 events | 1 events |
| 5   | 2   | True   | 51       | 79      | 85     | 100      | 75   | 75      | 106    | 1     | 1 events | 1 events |
| 6   | 1   | True   | 56       | 82      | 85     | 106      | 78   | 79      | 141    | 1     | 1 events | 1 events |
| 6   | 2   | True   | 46       | 77      | 80     | 103      | 71   | 71      | 127    | 1     | 1 events | 1 events |
| 7   | 1   | True   | 62       | 85      | 88     | 106      | 81   | 81      | 149    | 1     | 1 events | 1 events |
| 7   | 2   | True   | 48       | 78      | 81     | 104      | 74   | 76      | 108    | 1     | 1 events | 1 events |
| 8   | 1   | True   | 68       | 91      | 94     | 112      | 87   | 88      | 152    | 1     | 1 events | 1 events |
| 8   | 2   | True   | 46       | 82      | 87     | 108      | 73   | 74      | 129    | 1     | 1 events | 1 events |
| 9   | 1   | True   | 59       | 84      | 87     | 106      | 80   | 81      | 154    | 1     | 1 events | 1 events |
| 9   | 2   | True   | 37       | 69      | 72     | 94       | 62   | 63      | 100    | 1     | 1 events | 1 events |
